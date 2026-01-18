"use client"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Square, Paperclip, ArrowUpCircle, FileText, X, Upload } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useUIState } from "@/hooks/useUIState"
import { useChatStorage } from "@/hooks/useChatStorage"
import { UserDocument } from "@/lib/supabase"

interface Block {
  id: string
  type: "paragraph"
  content: string
}

interface ChatSectionProps {
  setDocumentBlocks: (blocks: Block[] | ((prev: Block[]) => Block[])) => void
  documentBlocks: Block[]
  onSaveUploadedDocument?: (fileName: string, fileContent: string, fileType?: string) => Promise<UserDocument | null>
}

export default function Chat({ setDocumentBlocks, documentBlocks, onSaveUploadedDocument }: ChatSectionProps) {
  const [file, setFile] = useState<File | null>(null)
  const [processedFile, setProcessedFile] = useState<File | null>(null)
  const [showReuploadPrompt, setShowReuploadPrompt] = useState(false)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Use chat storage hook for message persistence
  const {
    messages,
    setMessages,
    addMessage,
    saveMessage,
    isLoading: isChatLoading,
    isInitialized
  } = useChatStorage()

  const { uiMode, documentReady, selection, openDocument, setDocumentReady, clearSelection } = useUIState()

  useEffect(() => {
    // Auto scroll to bottom when messages change
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages])


  const applyEdit = (newText: string, selectionToUse: typeof selection) => {
    console.log('=== applyEdit called ===');
    console.log('newText:', newText);
    console.log('selectionToUse:', selectionToUse);

    if (!selectionToUse) {
      console.log('No selection, returning early');
      return;
    }

    const { blockId, startOffset, endOffset } = selectionToUse;

    // Use functional update to ensure we work with the latest state
    setDocumentBlocks((currentBlocks) => {
      console.log('Current documentBlocks:', currentBlocks);

      // Find the block containing the selection
      const blockIndex = currentBlocks.findIndex(b => b.id === blockId);
      console.log('blockIndex:', blockIndex);

      if (blockIndex === -1) {
        console.log('Block not found, returning current blocks');
        return currentBlocks;
      }

      const newBlocks = [...currentBlocks];
      const block = newBlocks[blockIndex];
      console.log('Block content before:', block.content);
      console.log('Using offsets:', { startOffset, endOffset });

      // Use the stored offsets directly (matching the working implementation)
      const before = block.content.substring(0, startOffset);
      const after = block.content.substring(endOffset);

      newBlocks[blockIndex] = {
        ...block,
        content: before + newText + after
      };

      console.log('Block content after:', newBlocks[blockIndex].content);
      console.log('Returning updated blocks:', newBlocks);
      return newBlocks;
    });

    // Clear selection
    clearSelection();
    window.getSelection()?.removeAllRanges();
  };

  const handleAIEdit = async () => {
    if (!input.trim() || !selection?.selectedText) return;

    // Capture selection before async operation to prevent stale closure
    const currentSelection = selection;

    setIsProcessing(true);
    setError('');

    try {
      const response = await fetch('/api/docrender', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Send the original Markdown so AI can preserve formatting
          selectedText: currentSelection.originalMarkdown,
          command: input.trim()
        })
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      console.log('=== API Response ===');
      console.log('data:', data);
      console.log('editedText:', data.editedText);

      if (data.error) {
        throw new Error(data.error);
      }

      // Pass the captured selection to applyEdit
      applyEdit(data.editedText, currentSelection);
      setInput('');

    } catch (err) {
      setError('Failed to process AI command. Please try again.');
      console.error('AI Edit Error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSend = async () => {
    if (loading || isProcessing) return;
    if (!input.trim() && !file) return;

    // If there's a selection, use AI edit instead
    if (selection?.selectedText && input.trim()) {
      await handleAIEdit();
      return;
    }

    const userMessage: { role: "user" | "assistant"; content: string } = {
      role: "user",
      content: input.trim(),
    }
    const systemInstruction = {
      role: "system",
      content:
        "Explain concepts step by step like a teacher. Rules:\n" +
        "- Use paragraphs for normal explanatory text.\n" +
        "- Use h1 only for main titles or primary sections.\n" +
        "- Use h2 for subsections.\n" +
        "- Use h3 for minor sections or breakdowns.\n" +
        "- Use strong only for key terms or short emphasis (never entire sentences).\n" +
        "- Use emphasis sparingly for tone or nuance.\n" +
        "- Use unordered or ordered lists for grouped or sequential information.\n" +
        "- Use blockquotes only for callouts, notes, or important observations.\n" +
        "- Use inline code for short technical references, variables, or commands.\n" +
        "- Use code blocks only for executable or structured code.\n" +
        "\n" +
        "Constraints:\n" +
        "- Do not invent new formatting types.\n" +
        "- Do not nest headings incorrectly.\n" +
        "- Do not overuse emphasis or strong text.\n" +
        "- Keep paragraphs concise and readable.\n" +
        "- Prefer clarity and hierarchy over decoration.\n"
    }

    // Build message content with selection context if present
    let messageContent = input.trim()
    if (selection) {
      messageContent = `[Context from document - Block ${selection.blockId}]: "${selection.selectedText}"\n\n${messageContent}`
    }

    const userMessageWithContext = {
      ...userMessage,
      content: messageContent,
    }

    // Add message and save to database
    await addMessage(userMessage)
    setInput("")

    // Clear selection after sending
    if (selection) {
      clearSelection()
    }

    setLoading(true)

    try {
      let res: Response

      if (file) {
        // Send with file using FormData
        const formData = new FormData()
        formData.append("file", file)
        formData.append("messages", JSON.stringify([...messages, userMessageWithContext]))

        res = await fetch("/api/chat", {
          method: "POST",
          body: formData,
        })

        // Save uploaded file to Supabase with 1hr TTL
        if (onSaveUploadedDocument) {
          const reader = new FileReader()
          reader.onload = async (e) => {
            const content = e.target?.result as string
            await onSaveUploadedDocument(file.name, content, file.type)
          }
          reader.readAsText(file)
        }

        setProcessedFile(file)
        setFile(null)
        setDocumentReady(true)
        setShowReuploadPrompt(false)

      } else {
        // Send without file using JSON
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [systemInstruction, ...messages, userMessageWithContext] }),
        })
      }

      if (!res.ok || !res.body) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      let assistantText = ""

      // Read the stream (but don't show in chat)
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        assistantText += decoder.decode(value, { stream: true })
      }

      // Flush any remaining decoder buffer
      assistantText += new TextDecoder().decode()

      // Add assistant response ONLY to document (not chat)
      const paragraphs = assistantText.split("\n\n").filter((p: string) => p.trim())
      const newBlocks = paragraphs.map((p: string, i: number) => ({
        id: `block-${Date.now()}-${i}`,
        type: "paragraph" as const,
        content: p.trim(),
      }))

      setDocumentBlocks((prev) => [...prev, ...newBlocks])

      // Save system message to database
      await addMessage({
        role: "system",
        content: "✨ Content generated successfully!",
        showOpenDocument: true,
      })
    } catch (err) {
      console.error(err)
      await addMessage({ role: "assistant", content: "Sorry, something went wrong." })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleOpenDocument = () => {
    openDocument()
  }

  const handleReupload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFile = e.target.files?.[0] || null
    if (newFile) {
      setFile(newFile)
      setShowReuploadPrompt(false)
    }
  }

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set dragging to false if leaving the container itself
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      // Validate file type
      const validTypes = ['.pdf', '.doc', '.docx']
      const fileExtension = '.' + droppedFile.name.split('.').pop()?.toLowerCase()

      if (validTypes.includes(fileExtension)) {
        setFile(droppedFile)
        setShowReuploadPrompt(false)
        setError('')
      } else {
        setError('Invalid file type. Please upload a PDF, DOC, or DOCX file.')
      }
    }
  }

  // Truncate text for selection preview
  const truncateText = (text: string, maxLength = 100) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + "..."
  }

  // Show loading skeleton while chat is initializing
  if (isChatLoading) {
    return (
      <div className="flex h-screen bg-gray-950 text-foreground rounded-2xl">
        <div className="flex flex-1 flex-col rounded-2xl border border-border bg-white p-4 md:p-6 dark:bg-neutral-950">

          {/* Header */}
          <div className="mb-4 flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-gray-100 dark:bg-neutral-800" />
            <div className="flex flex-col gap-2">
              <div className="h-3 w-32 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
              <div className="h-3 w-20 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
            </div>
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-4 overflow-hidden">
            {[...new Array(6)].map((_, idx) => (
              <div
                key={"chat-message-skeleton-" + idx}
                className={`flex ${idx % 2 === 0 ? "justify-start" : "justify-end"
                  }`}
              >
                <div className="max-w-xs w-full space-y-2 animate-pulse">
                  <div className="h-4 w-full rounded-lg bg-gray-100 dark:bg-neutral-800" />
                  <div className="h-4 w-3/4 rounded-lg bg-gray-100 dark:bg-neutral-800" />
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <div className="h-12 flex-1 animate-pulse rounded-lg bg-gray-100 dark:bg-neutral-800" />
              <div className="h-12 w-12 animate-pulse rounded-lg bg-gray-100 dark:bg-neutral-800" />
            </div>
          </div>
        </div>
      </div>

    )
  }

  return (
    <div
      className={`flex-1 flex flex-col h-screen bg-background text-foreground border-r border-border rounded-2xl relative transition-all duration-200 ${isDragging ? 'ring-2 ring-primary ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center rounded-2xl border-2 border-dashed border-primary"
          >
            <div className="flex flex-col items-center gap-3 text-primary">
              <Upload size={48} className="animate-bounce" />
              <p className="text-lg font-medium">Drop your file here</p>
              <p className="text-sm text-muted-foreground">PDF, DOC, or DOCX</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full h-full flex flex-col">
          {/* EMPTY STATE */}
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex-1 flex flex-col justify-center px-4 py-8"
            >
              <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-foreground mb-3">Hi User</h1>
              <p className="text-lg md:text-xl text-muted-foreground">Where should we start?</p>
              <div className="mt-8 space-y-3">
                <p className="text-sm text-muted-foreground">Try Uploading:</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-0.5">→</span>
                    <span>Upload a document to create notes</span>
                  </li>
                </ul>
              </div>
            </motion.div>
          ) : (
            <div className="py-8 space-y-6 px-4">
              <AnimatePresence mode="popLayout">
                {messages.map((m, i) => {
                  const isUser = m.role === "user"
                  const isSystem = m.role === "system"

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] ${isUser
                          ? "bg-primary text-primary-foreground rounded-2xl px-4 py-3 text-sm md:text-base"
                          : isSystem
                            ? "bg-muted text-muted-foreground rounded-2xl px-4 py-3 border border-border text-sm md:text-base max-w-[80%]"
                            : "w-full text-foreground text-sm md:text-base"
                          }`}
                      >
                        <ReactMarkdown>{m.content}</ReactMarkdown>

                        {/* Open Document Button */}
                        {isSystem && m.showOpenDocument && uiMode === "chat" && (
                          <button
                            onClick={handleOpenDocument}
                            className="mt-3 flex items-center gap-2 bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 rounded-lg transition-opacity duration-200 text-sm font-medium"
                          >
                            <FileText size={16} />
                            <span>Open Document</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {/* LOADING */}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex gap-2 py-4">
                    <span
                      className="w-2.5 h-2.5 bg-muted-foreground rounded-full animate-bounce"
                      style={{ animationDelay: "0s" }}
                    />
                    <span
                      className="w-2.5 h-2.5 bg-muted-foreground rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                    <span
                      className="w-2.5 h-2.5 bg-muted-foreground rounded-full animate-bounce"
                      style={{ animationDelay: "0.4s" }}
                    />
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="max-w-2xl mx-auto px-4 mb-3 w-full">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-600">
            {error}
          </div>
        </div>
      )}

      {/* SELECTION PREVIEW */}
      {selection && (
        <div className="max-w-2xl mx-auto px-4 mb-3 w-full">
          <div className="bg-muted rounded-xl p-3 flex items-start justify-between border border-border">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground mb-1">Selected text:</div>
              <p className="text-sm text-muted-foreground line-clamp-2">&#34;{truncateText(selection.selectedText)}&#34;</p>
            </div>
            <button
              onClick={clearSelection}
              className="ml-3 text-muted-foreground hover:text-foreground transition-colors duration-200 flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* INPUT BAR */}
      <div className="w-full max-w-2xl mx-auto px-4 pb-4 self-center">
        <AnimatePresence>
          {file && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="mb-3"
            >
              <div className="bg-card border border-primary/30 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
                    <FileText size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(2)} KB • Ready to upload
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="ml-3 p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors duration-200 flex-shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-muted rounded-2xl p-1 border border-border transition-all duration-200 hover:border-border/80 focus-within:border-primary/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={selection ? "Edit selected text..." : "Ask Notovo..."}
            className="w-full px-5 py-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none text-base"
          />

          <div className="flex items-center justify-between px-3 pb-3">
            <label
              className="cursor-pointer p-2 text-muted-foreground hover:text-foreground hover:bg-card rounded-lg transition-colors duration-200"
              title="Attach file"
            >
              <Paperclip size={20} />
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={handleFileChange} />
            </label>

            <button
              onClick={handleSend}
              disabled={(loading || isProcessing) || (!input.trim() && !file)}
              className="p-2 rounded-lg transition-all duration-200"
              title="Send message"
            >
              {(loading || isProcessing) ? (
                <Square size={20} className="text-muted-foreground animate-pulse" />
              ) : (
                <ArrowUpCircle
                  size={20}
                  className={input.trim() || file ? "text-primary" : "text-muted-foreground cursor-not-allowed"}
                />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}