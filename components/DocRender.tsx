// components/DocRender.tsx
'use client';

import React, { useRef, useState, useMemo } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Download } from 'lucide-react';
import ReactMarkdown from "react-markdown";
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import remarkGfm from 'remark-gfm';
import { SelectionData } from '@/hooks/useUIState';
import { useAuth } from '@/hooks/AuthContext';
import LoginPromptModal from '@/components/LoginPromptModal';


interface Block {
    id: string;
    type: 'paragraph';
    content: string;
    metadata?: Record<string, unknown>;
}

interface DocRenderProps {
    documentBlocks: Block[];
    setDocumentBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
    onSelectionChange?: (data: SelectionData | null) => void;
}

export default function DocRender({ documentBlocks, setDocumentBlocks, onSelectionChange }: DocRenderProps) {
    const documentRef = useRef<HTMLDivElement>(null);
    const [showLoginPrompt, setShowLoginPrompt] = useState(false);
    const { isAuthenticated } = useAuth();
    const isMobile = useIsMobile();

    // Group adjacent blocks so that fenced code blocks spanning multiple blocks render correctly
    const renderGroups = useMemo(() => {
        const groups: { id: string; originalIds: string[]; content: string }[] = [];
        let current: Block[] = [];
        let fenceOpen = false;

        const pushCurrent = () => {
            if (current.length === 0) return;
            groups.push({
                id: current[0].id,
                originalIds: current.map(b => b.id),
                content: current.map(b => b.content).join('\n\n'),
            });
            current = [];
        };

        for (const block of documentBlocks) {
            current.push(block);
            const content = block.content || '';
            const tickCount = (content.match(/```/g) || []).length;
            if (tickCount % 2 === 1) {
                fenceOpen = !fenceOpen;
            }
            if (!fenceOpen) {
                pushCurrent();
            }
        }
        // If the last group is still open (unbalanced fences), still push it
        pushCurrent();

        return groups;
    }, [documentBlocks]);

    // Handle text selection - only detect and emit, no UI
    const handleMouseUp = () => {
        console.log('=== handleMouseUp called ===');
        const sel = window.getSelection();
        console.log('Selection:', sel);

        if (!sel || sel.rangeCount === 0) {
            console.log('No selection or no ranges');
            onSelectionChange?.(null);
            return;
        }

        // Normalize whitespace - replace multiple spaces/newlines with single space
        const selectedText = sel.toString().trim().replace(/\s+/g, ' ');
        console.log('Selected text:', selectedText);

        if (!selectedText) {
            console.log('Empty selection');
            onSelectionChange?.(null);
            return;
        }

        const range = sel.getRangeAt(0);
        console.log('Range startContainer:', range.startContainer);

        // Get the starting element - handle text nodes
        let startElement: HTMLElement | null = null;
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
            startElement = range.startContainer.parentElement;
        } else {
            startElement = range.startContainer as HTMLElement;
        }

        console.log('Start element:', startElement);

        if (!startElement) {
            console.log('No start element found');
            onSelectionChange?.(null);
            return;
        }

        // Use closest() for more reliable traversal - find the element with data-block-id
        const blockElement = startElement.closest('[data-block-id]') as HTMLElement;
        console.log('Block element:', blockElement);

        if (!blockElement) {
            console.log('No block element with data-block-id found');
            onSelectionChange?.(null);
            return;
        }

        const blockId = blockElement.dataset.blockId!;
        console.log('Block ID:', blockId);

        // Find the block content to calculate offsets
        const block = documentBlocks.find(b => b.id === blockId);
        if (!block) {
            console.log('Block not found in documentBlocks');
            onSelectionChange?.(null);
            return;
        }

        // Helper to strip Markdown and create position map
        const createPositionMap = (markdown: string): { stripped: string; map: number[] } => {
            let stripped = '';
            const map: number[] = []; // map[strippedIndex] = originalIndex

            let i = 0;
            while (i < markdown.length) {
                // Skip ** (bold)
                if (markdown.substring(i, i + 2) === '**') {
                    i += 2;
                    continue;
                }
                // Skip __ (bold alt)
                if (markdown.substring(i, i + 2) === '__') {
                    i += 2;
                    continue;
                }
                // Skip single * or _ (italic) - but only if followed by non-space
                if ((markdown[i] === '*' || markdown[i] === '_') &&
                    i + 1 < markdown.length && markdown[i + 1] !== ' ') {
                    // Check if this is formatting by looking for closing marker
                    const marker = markdown[i];
                    const closeIdx = markdown.indexOf(marker, i + 1);
                    if (closeIdx !== -1 && closeIdx < markdown.indexOf(' ', i + 1)) {
                        i++;
                        continue;
                    }
                }
                // Skip ` (inline code)
                if (markdown[i] === '`') {
                    i++;
                    continue;
                }

                map.push(i);
                stripped += markdown[i];
                i++;
            }

            return { stripped, map };
        };

        const { stripped, map } = createPositionMap(block.content);
        console.log('Stripped content:', stripped);
        console.log('Selected text:', selectedText);

        // Find in stripped content
        let strippedStartOffset = stripped.indexOf(selectedText);

        // Try normalized match if exact fails
        if (strippedStartOffset === -1) {
            const normalizedStripped = stripped.replace(/\s+/g, ' ');
            const normalizedSelectedText = selectedText.replace(/\s+/g, ' ');
            strippedStartOffset = normalizedStripped.indexOf(normalizedSelectedText);
        }

        console.log('strippedStartOffset:', strippedStartOffset);

        let startOffset: number;
        let endOffset: number;

        if (strippedStartOffset !== -1 && map.length > 0) {
            // Map back to original positions
            startOffset = map[strippedStartOffset] ?? 0;
            const strippedEndOffset = Math.min(strippedStartOffset + selectedText.length, map.length);
            // For end offset, we need to go past the last character
            if (strippedEndOffset < map.length) {
                endOffset = map[strippedEndOffset];
            } else {
                // End is at the end of content
                endOffset = block.content.length;
            }
        } else {
            // Fallback: try direct indexOf
            startOffset = block.content.indexOf(selectedText);
            if (startOffset === -1) {
                // Last resort: use first word
                const firstWord = selectedText.split(' ')[0];
                startOffset = block.content.indexOf(firstWord);
                if (startOffset === -1) startOffset = 0;
            }
            endOffset = startOffset + selectedText.length;
        }

        console.log('Calculated offsets:', { startOffset, endOffset });

        // Extract the original Markdown substring using the calculated offsets
        const originalMarkdown = block.content.substring(startOffset, endOffset);
        console.log('Original Markdown slice:', originalMarkdown);

        // Emit selection data to parent with offsets and original markdown
        console.log('Calling onSelectionChange with:', { blockId, selectedText, originalMarkdown, startOffset, endOffset });
        onSelectionChange?.({
            blockId,
            selectedText,
            originalMarkdown,
            startOffset,
            endOffset,
        });
    };

    // Clear selection when clicking outside
    const handleMouseDown = () => {
        // Selection will be handled on mouseUp
    };


    // Export to PDF matching the preview
    const exportToPDF = async () => {
        // Gate PDF download behind authentication
        if (!isAuthenticated) {
            setShowLoginPrompt(true);
            return;
        }

        const printWindow = window.open('', '', 'width=800,height=600');
        if (printWindow) {
            // Get the rendered HTML from the document
            const documentContent = documentRef.current?.innerHTML || '';

            printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <link href="https://fonts.googleapis.com/css2?family=Pangolin&display=swap" rel="stylesheet">
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css">
          <style>
          
            @page { 
              size: A4; 
              margin: 0;
            }
            * {
              margin: 0;
              padding: 0;
            }
            body {
             
               color-adjust: exact !important;
              text-rendering: geometricPrecision;
              font-family: 'Pangolin', cursive !important;
              font-size: 12px;
              line-height: 1.8;
              background-color: #030712 !important;
              color: #D8A1A1;
              margin: 2cm;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            
            p { 
              color: #D8A1A1 !important;
              margin-bottom: 1rem;
              line-height: 1.75;
            }
            
            strong {
              color: #F2B8A2 !important;
              font-weight: 600;
            }
            
            em {
              color: #C7C7C7 !important;
              font-style: italic;
            }
            
            h1 {
              color: #6EE7E7 !important;
              font-size: 1.875rem;
              font-weight: 700;
              margin-bottom: 1rem;
            }
            
            h2 {
              color: #A7F3D0 !important;
              font-size: 1.5rem;
              font-weight: 600;
              margin-bottom: 0.75rem;
            }
            
            h3 {
              color: #C4B5FD !important;
              font-size: 1.25rem;
              font-weight: 500;
              margin-bottom: 0.5rem;
            }
            
            ul {
              color: #D28ADB !important;
              list-style-type: disc;
              list-style-position: inside;
              margin-bottom: 1rem;
            }
            
            ol {
              color: #D1696F !important;
              list-style-type: decimal;
              list-style-position: inside;
              margin-bottom: 1rem;
            }
            
            li {
              margin-left: 0.5rem;
              margin-bottom: 0.25rem;
              color: inherit !important;
            }
            
            blockquote {
              border-left: 4px solid #5FB3A2 !important;
              padding-left: 1rem;
              font-style: italic;
              color: #9DB8A0 !important;
              margin-bottom: 1rem;
            }
            
            code {
              background-color: #111827 !important;
              color: #93C5FD !important;
              padding: 0.125rem 0.375rem;
              border-radius: 0.25rem;
              font-size: 0.875rem;
              font-family: monospace;
            }
            
            pre {
              background-color: #0B1220 !important;
              color: #BFC5CC !important;
              padding: 1rem;
              border-radius: 0.5rem;
              overflow-x: auto;
              margin-bottom: 1rem;
            }
            
            pre code {
              background-color: transparent !important;
              padding: 0;
            }
            
            a {
              color: #6EE7E7 !important;
              text-decoration: underline;
              text-underline-offset: 4px;
            }
            
            a:hover {
              color: #93C5FD !important;
            }
            
            hr {
              border: none;
              border-top: 1px solid #1F2937 !important;
              margin: 1.5rem 0;
            }
            
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 1rem;
              border: 1px solid #374151 !important;
            }
            
            thead {
              background-color: #1F2937 !important;
            }
            
            th {
              padding: 0.5rem 1rem;
              text-align: left;
              color: #A7F3D0 !important;
              font-weight: 600;
              border: 1px solid #374151 !important;
            }
            
            td {
              padding: 0.5rem 1rem;
              color: #D8A1A1 !important;
              border: 1px solid #374151 !important;
            }
            
            tr {
              border-bottom: 1px solid #374151 !important;
            }
            
            .mb-6 {
              margin-bottom: 1.5rem;
            }
            
            /* KaTeX styling */
            .katex {
              font-size: 1.1em;
            }
            
            @media print {
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              body {
                background-color: #030712 !important;
              }
            }
          </style>
        </head>
        <body>
          ${documentContent}
        </body>
      </html>
    `);
            await printWindow.document.fonts.ready;
            printWindow.document.close();
            setTimeout(() => printWindow.print(), 500);
        }
    };

    return (
        <div className="flex flex-col h-full bg-neutral-900 text-neutral-100 rounded-b-2xl border-l-2 overflow-hidden">
            <div className="flex-1 overflow-y-auto scrollbar-hide">
                <div className={`mx-auto ${isMobile ? 'w-full' : 'max-w-4xl'}`}>

                    {/* Hidden PDF export button - triggered from toolbar */}
                    <button
                        data-export-pdf
                        onClick={exportToPDF}
                        className="sr-only"
                        aria-hidden="true"
                    >
                        <Download size={20} />
                    </button>

                    {/* Document Preview */}
                    <div className={`flex-1 ${isMobile ? 'p-2' : 'p-8'}`}>
                        <div
                            className="bg-gray-950 mx-auto shadow-2xl"
                            style={{
                                maxWidth: isMobile ? '100%' : '21cm',
                                width: '100%',
                                minHeight: isMobile ? 'auto' : '29.7cm',
                                padding: isMobile ? '1rem' : '2cm',
                                fontFamily: "'Pangolin', cursive"
                            }}
                        >
                            <div
                                ref={documentRef}
                                onMouseUp={handleMouseUp}
                                onMouseDown={handleMouseDown}
                                className="prose max-w-none "
                                style={{ fontSize: '12px', lineHeight: '1.8' }}
                            >
                                {documentBlocks.length === 0 ? (
                                    <div className="text-gray-400 text-center mt-20">
                                        Chat with AI to generate document content
                                    </div>
                                ) : (
                                    <>
                                        {/* UX Hint for selection */}
                                        <div className="text-xs text-muted-foreground text-center mb-4 flex items-center justify-center gap-1 opacity-70">
                                            <span>💡</span>
                                            <span>Select text to edit with AI</span>
                                        </div>
                                        {renderGroups.map((group) => {
                                            const processedContent = group.content
                                                .replace(/\\\[/g, '$$')  // Converts \[ to $$
                                                .replace(/\\]/g, '$$')  // Converts \] to $$
                                                .replace(/\\\(/g, '$')   // Converts \( to $
                                                .replace(/\\\)/g, '$');

                                            return (
                                                <div
                                                    key={group.id}
                                                    data-block-id={group.id}
                                                    className="mb-6 select-text cursor-text"
                                                >
                                                    <ReactMarkdown
                                                        components={{
                                                            p: ({ children }) => (
                                                                <p className="text-[#D8A1A1] mb-4 leading-relaxed">
                                                                    {children}
                                                                </p>
                                                            ),

                                                            strong: ({ children }) => (
                                                                <strong className="text-[#F2B8A2] font-semibold">
                                                                    {children}
                                                                </strong>
                                                            ),

                                                            em: ({ children }) => (
                                                                <em className="text-[#C7C7C7] italic">
                                                                    {children}
                                                                </em>
                                                            ),

                                                            h1: ({ children }) => (
                                                                <h1 className="text-[#6EE7E7] text-3xl font-bold mb-4">
                                                                    {children}
                                                                </h1>
                                                            ),

                                                            h2: ({ children }) => (
                                                                <h2 className="text-[#A7F3D0] text-2xl font-semibold mb-3">
                                                                    {children}
                                                                </h2>
                                                            ),

                                                            h3: ({ children }) => (
                                                                <h3 className="text-[#C4B5FD] text-xl font-medium mb-2">
                                                                    {children}
                                                                </h3>
                                                            ),

                                                            ul: ({ children }) => (
                                                                <ul className="list-disc list-inside text-[#D28ADB] mb-4 space-y-1">
                                                                    {children}
                                                                </ul>
                                                            ),

                                                            ol: ({ children }) => (
                                                                <ol className="list-decimal list-inside text-[#D1696F] mb-4 space-y-1">
                                                                    {children}
                                                                </ol>
                                                            ),

                                                            li: ({ children }) => (
                                                                <li className="ml-2">
                                                                    {children}
                                                                </li>
                                                            ),

                                                            blockquote: ({ children }) => (
                                                                <blockquote className="border-l-4 border-[#5FB3A2] pl-4 italic text-[#9DB8A0] mb-4">
                                                                    {children}
                                                                </blockquote>
                                                            ),

                                                            code: ({ children }) => (
                                                                <code className="bg-[#0B1220] text-[#93C5FD] px-1.5 py-0.5 rounded text-sm">
                                                                    {children}
                                                                </code>
                                                            ),

                                                            pre: ({ children }) => (
                                                                <pre className="bg-[#0B1220] text-[#BFC5CC] p-4 rounded-lg overflow-x-auto mb-4">{children}</pre>
                                                            ),

                                                            a: ({ children, href }) => (
                                                                <a
                                                                    href={href}
                                                                    className="text-[#6EE7E7] underline underline-offset-4 hover:text-[#93C5FD] transition-colors"
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                >
                                                                    {children}
                                                                </a>
                                                            ),

                                                            hr: () => (
                                                                <hr className="border-[#1F2937] my-6" />
                                                            ),
                                                            table: ({ children }) => (
                                                                <div className="overflow-x-auto mb-4">
                                                                    <table className="min-w-full border-collapse border border-[#374151]">
                                                                        {children}
                                                                    </table>
                                                                </div>
                                                            ),

                                                            thead: ({ children }) => (
                                                                <thead className="bg-[#1F2937]">
                                                                    {children}
                                                                </thead>
                                                            ),

                                                            tbody: ({ children }) => (
                                                                <tbody>
                                                                    {children}
                                                                </tbody>
                                                            ),

                                                            tr: ({ children }) => (
                                                                <tr className="border-b border-[#374151]">
                                                                    {children}
                                                                </tr>
                                                            ),

                                                            th: ({ children }) => (
                                                                <th className="px-4 py-2 text-left text-[#A7F3D0] font-semibold border border-[#374151]">
                                                                    {children}
                                                                </th>
                                                            ),

                                                            td: ({ children }) => (
                                                                <td className="px-4 py-2 text-[#D8A1A1] border border-[#374151]">
                                                                    {children}
                                                                </td>
                                                            ),
                                                        }}
                                                        remarkPlugins={[remarkMath, remarkGfm]}
                                                        rehypePlugins={[[rehypeKatex, { output: 'html' }]]}
                                                    >
                                                        {processedContent}
                                                    </ReactMarkdown>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Login Prompt Modal */}
            <LoginPromptModal
                isOpen={showLoginPrompt}
                onClose={() => setShowLoginPrompt(false)}
                feature="PDF download"
            />
        </div>
    );
}
