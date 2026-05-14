"use client"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Square, ArrowUpCircle, FileText, X, Upload, ChevronRight, Lightbulb, Plus, ChevronDown, Paperclip } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useUIState } from "@/hooks/useUIState"
import { useChatStorage } from "@/hooks/useChatStorage"
import { UserDocument } from "@/lib/supabase"
import { useAuth } from "@/hooks/AuthContext"
import LoginPromptModal from "@/components/LoginPromptModal"
import { classifyIntent, IntentType } from "@/lib/intentTypes"
import Image from "next/image"

interface Block {
  id: string
  type: "paragraph"
  content: string
}

interface ChatSectionProps {
  setDocumentBlocks: (blocks: Block[] | ((prev: Block[]) => Block[])) => void
  documentBlocks: Block[]
  onSaveUploadedDocument?: (fileName: string, fileContent: string, fileType?: string, fileSize?: number, userId?: string) => Promise<UserDocument | null>
  // Version control props
  currentVersionIndex?: number
  totalVersions?: number
  onSwitchToVersion?: (versionIndex: number) => void
  onViewDocument?: () => void
}

export default function Chat({ setDocumentBlocks, documentBlocks, onSaveUploadedDocument, totalVersions, onSwitchToVersion, onViewDocument }: ChatSectionProps) {
  const [file, setFile] = useState<File | null>(null)
  const [processedFile, setProcessedFile] = useState<File | null>(null)
  const [showReuploadPrompt, setShowReuploadPrompt] = useState(false)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const [pendingFeature, setPendingFeature] = useState<string>('')
  // Think Mode state
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [thinkingElapsed, setThinkingElapsed] = useState(0)
  const thinkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const plusMenuRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)


  // Auth state
  const { isAuthenticated, user } = useAuth()

  // Use chat storage hook for message persistence
  const {
    messages,
    setMessages,
    addMessage,
    saveMessage,
    isLoading: isChatLoading,
    isInitialized
  } = useChatStorage()

  const {
    uiMode,
    documentReady,
    selection,
    openDocument,
    setDocumentReady,
    clearSelection,
    hasDocument,
    setHasDocument,
    isProcessingIntent,
    setProcessingIntent
  } = useUIState()
  const [classifiedIntent, setClassifiedIntent] = useState<IntentType | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null);;

  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input]);
  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages])

  // Close plus menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Thinking timer: counts up while loading in think mode
  useEffect(() => {
    if (loading && isThinkingEnabled) {
      setThinkingElapsed(0)
      thinkingTimerRef.current = setInterval(() => {
        setThinkingElapsed(s => s + 1)
      }, 1000)
    } else {
      if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current)
    }
    return () => { if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current) }
  }, [loading, isThinkingEnabled])


  // Helper to prepare messages for API - excludes edit commands and version notifications
  // Edit messages should only affect their specific edit, not subsequent responses
  const getMessagesForAPI = (msgs: typeof messages) => {
    return msgs
      .filter(m => {
        // Exclude edit messages (they contain commands like "in tamil" that shouldn't affect subsequent chats)
        if (m.editMetadata) return false;
        // Exclude version notification messages (system messages with showOpenDocument)
        if (m.showOpenDocument) return false;
        return true;
      })
      .map(m => ({
        role: m.role,
        content: m.content
      }))
  }

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

    // Gate AI editing behind authentication
    if (!isAuthenticated) {
      setPendingFeature('AI document editing');
      setShowLoginPrompt(true);
      return;
    }

    // Capture selection and input before async operation to prevent stale closure
    const currentSelection = selection;
    const editCommand = input.trim();

    // Add user message with editMetadata for persistent preview
    await addMessage({
      role: "user",
      content: editCommand,
      editMetadata: {
        selectedText: currentSelection.selectedText,
        command: editCommand
      }
    });

    setIsProcessing(true);
    setError('');
    setInput('');

    try {
      const response = await fetch('/api/docrender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedText: currentSelection.originalMarkdown,
          command: editCommand,
          userId: user?.id,
          useThinking: isThinkingEnabled,
        })
      });

      const data = await response.json();

      // ── Structured usage errors — do NOT create a version, preserve doc state
      if (response.status === 429 || data.error === 'TOKEN_LIMIT_EXCEEDED' || data.error === 'EDIT_LIMIT_EXCEEDED') {
        await addMessage({
          role: "assistant",
          content: `⚠️ ${data.message || 'Usage limit reached. Please try again later.'}`
        });
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'API request failed');
      }

      console.log('=== API Response ===');
      console.log('data:', data);
      console.log('editedText:', data.editedText);

      if (data.error) {
        throw new Error(data.error);
      }

      // Check if AI returned empty text
      if (!data.editedText || !data.editedText.trim()) {
        await addMessage({
          role: "assistant",
          content: "⚠️ Couldn't generate the edit. Please try rephrasing your command."
        });
        return;
      }

      // Pass the captured selection to applyEdit
      applyEdit(data.editedText, currentSelection);

      // Add version button message (edit creates a new version)
      await addMessage({
        role: "system",
        content: "",
        showOpenDocument: true,
        versionIndex: totalVersions ?? 0,
        reasoningSummary: data.reasoningSummary || undefined,
      });

    } catch (err) {
      setError('Failed to process AI command. Please try again.');
      console.error('AI Edit Error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle CHAT_ONLY intent - respond in chat only, no document changes
  const handleChatOnly = async (userMessage: { role: "user" | "assistant"; content: string }) => {
    setLoading(true)
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...getMessagesForAPI(messages), { role: 'user', content: userMessage.content }],
          userId: user?.id,
          useThinking: isThinkingEnabled,
          intent: 'CHAT_ONLY'
        }),
      })

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}))
        await addMessage({ role: "assistant", content: `⚠️ ${data.message || "You've reached your usage limit. Please try again later."}` })
        return
      }

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)

      if (isThinkingEnabled) {
        const data = await res.json().catch(() => ({}))
        await addMessage({
          role: "assistant",
          content: data.answer || data.error || 'Something went wrong.',
          reasoningSummary: data.reasoning_summary || undefined,
        })
        return
      }

      if (!res.body) throw new Error('No response body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        assistantText += decoder.decode(value, { stream: true })
      }
      assistantText += new TextDecoder().decode()
      await addMessage({ role: "assistant", content: assistantText })
    } catch (err) {
      console.error(err)
      await addMessage({ role: "assistant", content: "Sorry, something went wrong." })
    } finally {
      setLoading(false)
    }
  }

  const handleDocumentCreate = async (userMessage: { role: "user" | "assistant"; content: string }) => {
    setLoading(true)
    try {
      let res: Response
      let extractedText = "";

      if (file) {
        // Step 1: Upload file to parse-file endpoint
        const formData = new FormData()
        formData.append("file", file)
        if (user?.id) formData.append("userId", user.id)

        const parseRes = await fetch("/api/parse-file", {
          method: "POST",
          body: formData,
        })

        if (parseRes.status === 429 || parseRes.status === 403) {
          const data = await parseRes.json().catch(() => ({}))
          await addMessage({
            role: "assistant",
            content: `⚠️ ${data.message || "Usage limit reached. Please try again later."}`,
          })
          setLoading(false)
          return
        }

        if (!parseRes.ok) {
          const data = await parseRes.json().catch(() => ({}))
          throw new Error(data.error || "Failed to parse file")
        }

        const parseData = await parseRes.json()
        extractedText = parseData.text

        if (onSaveUploadedDocument) {
          await onSaveUploadedDocument(file.name, extractedText, file.type, file.size, user?.id)
        }

        setProcessedFile(file)
        setFile(null)
        setDocumentReady(true)
        setShowReuploadPrompt(false)
      }

      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...getMessagesForAPI(messages), { role: 'user', content: userMessage.content }],
          userId: user?.id,
          useThinking: isThinkingEnabled,
          intent: 'DOCUMENT_CREATE',
          extractedText: extractedText || undefined
        }),
      })

      // ── Structured usage errors
      if (res.status === 429 || res.status === 403) {
        const data = await res.json().catch(() => ({}))
        await addMessage({
          role: "assistant",
          content: `⚠️ ${data.message || "You've reached your usage limit. Please try again later."}`,
        })
        setLoading(false)
        return
      }

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)

      // ── THINK MODE: JSON response (non-streaming)
      let assistantText = ""
      let reasoningSummary: string | undefined

      if (isThinkingEnabled) {
        const data = await res.json().catch(() => ({}))
        assistantText = data.answer || ''
        reasoningSummary = data.reasoning_summary || undefined
      } else {
        // ── NORMAL MODE: streaming (unchanged)
        if (!res.body) throw new Error('No response body')
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          assistantText += decoder.decode(value, { stream: true })
        }
        assistantText += new TextDecoder().decode()
      }

      // Check if AI returned empty content
      if (!assistantText || !assistantText.trim()) {
        await addMessage({ role: "assistant", content: "⚠️ Couldn't generate content. Please try again with a different prompt." })
        return
      }

      // Safe block splitting: Split by \n\n but do NOT split inside Markdown code blocks (```)
      const rawChunks = assistantText.split("\n\n");
      const paragraphs: string[] = [];
      let currentChunk = "";
      let inCodeBlock = false;

      for (const chunk of rawChunks) {
        const codeBlockMarkers = (chunk.match(/```/g) || []).length;
        if (codeBlockMarkers % 2 !== 0) {
          inCodeBlock = !inCodeBlock;
        }

        if (currentChunk) {
          currentChunk += "\n\n" + chunk;
        } else {
          currentChunk = chunk;
        }

        if (!inCodeBlock) {
          if (currentChunk.trim()) paragraphs.push(currentChunk.trim());
          currentChunk = "";
        }
      }
      
      if (currentChunk.trim()) {
        paragraphs.push(currentChunk.trim());
      }

      const newBlocks = paragraphs.map((p: string, i: number) => ({
        id: `block-${Date.now()}-${i}`,
        type: "paragraph" as const,
        content: p,
      }))

      if (newBlocks.length === 0) {
        await addMessage({ role: "assistant", content: "⚠️ Couldn't generate content. Please try again with a different prompt." })
        return
      }

      setDocumentBlocks((prev) => [...prev, ...newBlocks])
      setHasDocument(true)

      await addMessage({
        role: "system",
        content: "",
        showOpenDocument: true,
        versionIndex: totalVersions ?? 0,
        reasoningSummary,
      })
    } catch (err) {
      console.error(err)
      await addMessage({ role: "assistant", content: "⚠️ Something went wrong while generating. Please try your command again." })
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (loading || isProcessing || isProcessingIntent) return;
    if (!input.trim() && !file) return;

    // If there's a selection, it's always DOCUMENT_EDIT intent
    if (selection?.selectedText && input.trim()) {
      await handleAIEdit();
      return;
    }

    // Build user message with optional file metadata
    const userMessage: {
      role: "user" | "assistant";
      content: string;
      fileMetadata?: { fileName: string; fileSize: number; fileType: string };
    } = {
      role: "user",
      content: input.trim(),
    }

    // Include file metadata if file is attached (for persistent preview)
    if (file) {
      userMessage.fileMetadata = {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      }
    }

    // Add user message and clear input
    await addMessage(userMessage)
    setInput("")

    // File upload always triggers DOCUMENT_CREATE
    if (file) {
      setClassifiedIntent('DOCUMENT_CREATE')
      await handleDocumentCreate(userMessage)
      return
    }

    // Classify intent using AI
    setProcessingIntent(true)
    try {
      const classification = await classifyIntent(
        userMessage.content,
        !!selection,
        !!file,
        hasDocument || documentBlocks.length > 0,
        user?.id
      )

      setClassifiedIntent(classification.intent)
      console.log('Intent classified:', classification)

      // Route based on intent
      switch (classification.intent) {
        case 'CHAT_ONLY':
          await handleChatOnly(userMessage)
          break
        case 'DOCUMENT_CREATE':
          await handleDocumentCreate(userMessage)
          break
        case 'DOCUMENT_EDIT':
          // Document edit requires selection - if none, fall back to chat
          if (!selection) {
            await addMessage({
              role: "assistant",
              content: "💡 To edit the document, please select some text first, then tell me what changes you'd like."
            })
          } else {
            await handleAIEdit()
          }
          break
        default:
          await handleChatOnly(userMessage)
      }
    } catch (err) {
      console.error('Intent classification error:', err)
      // Fall back to chat on error
      await handleChatOnly(userMessage)
    } finally {
      setProcessingIntent(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    // On mobile, Enter creates a new line; on desktop, Enter sends (Shift+Enter for new line)
    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 768
    if (e.key === "Enter" && !e.shiftKey && !isMobileViewport) {
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

  const truncateText = (text: string, maxLength = 100) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + "..."
  }
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  // ── ReasoningBubble: collapsible Think Mode summary ───────────────────────
  function ReasoningBubble({ summary }: { summary: string }) {
    const [open, setOpen] = useState(false)
    return (
      <div className="mb-1.5">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors select-none"
        >
          <Lightbulb size={11} className="text-indigo-400" />
          <span>Thought for a moment</span>
          <ChevronDown
            size={11}
            className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="mt-1.5 text-xs text-muted-foreground/80 leading-relaxed pl-3 border-l border-indigo-400/30 italic">
                {summary}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }





  return (
    <div
      className={`flex-1 flex flex-col h-full bg-background text-foreground border-r border-border relative transition-all duration-200 ${isDragging ? 'ring-2 ring-primary ring-inset' : ''}`}
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
        <div className="max-w-2xl mx-auto w-full h-full flex flex-col">
          {/* EMPTY STATE */}
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex-1 flex flex-col justify-center items-center px-4 py-8"
            >
              {/* Mobile: mascot + study prompt */}
              <div className="flex flex-col items-center md:hidden">
                <Image src="/figma-assets/mascot.svg" alt="Notovo mascot" width={96}
                  height={96}
                  className="mb-6" />
                <p className="text-lg text-neutral-500 text-center">What are we studying today?</p>
              </div>
              {/* Desktop: original greeting */}
              <div className="hidden md:block flex-wrap items-center ">
                <Image src="/figma-assets/mascot.svg" alt="Notovo mascot" width={250}
                       height={200}
                       className="mb-6 pl-10" />
                <p className="text-2xl text-neutral-500">What are we studying today?</p>
              </div>
            </motion.div>
          ) : (
            <div className="py-8 space-y-6 px-4">
              <AnimatePresence mode="popLayout">
                {messages.map((m, i) => {
                  const isUser = m.role === "user"
                  const isSystem = m.role === "system"

                  // Helper to format file size
                  const formatFileSize = (bytes: number) => {
                    if (bytes < 1024) return `${bytes} B`
                    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
                    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
                  }

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div className="flex flex-col gap-2 max-w-[80%]">
                        {/* Edit with AI Preview for User Messages */}
                        {isUser && m.editMetadata && (
                          <div className="bg-muted rounded-xl p-3 border border-border">
                            <div className="text-xs font-semibold text-foreground mb-1">Editing text:</div>
                            <p className="text-sm text-muted-foreground line-clamp-2">&quot;{truncateText(m.editMetadata.selectedText)}&quot;</p>
                          </div>
                        )}

                        {/* File Attachment Preview for User Messages (persistent via fileMetadata) */}
                        {isUser && m.fileMetadata && (
                          <div className="flex items-center gap-3 bg-muted/50 border border-border rounded-xl px-4 py-3">
                            <div className="flex-shrink-0 w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                              <FileText size={20} className="text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {m.fileMetadata.fileName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(m.fileMetadata.fileSize)}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Reasoning Summary Bubble (Think Mode) */}
                        {!isUser && !isSystem && m.reasoningSummary && (
                          <ReasoningBubble summary={m.reasoningSummary} />
                        )}

                        {/* Message Content */}
                        <div
                          className={`${isUser
                            ? "bg-primary text-primary-foreground rounded-2xl px-4 py-3 text-sm md:text-base"
                            : isSystem
                              ? "bg-muted text-muted-foreground rounded-2xl px-4 py-3 border border-border text-sm md:text-base"
                              : "w-full text-foreground text-sm md:text-base"
                            }`}
                        >
                          {/* Render version button for system messages with showOpenDocument */}
                          {isSystem && m.showOpenDocument && m.versionIndex !== undefined ? (
                            <button
                              onClick={() => {
                                // Switch to this version
                                if (onSwitchToVersion) {
                                  onSwitchToVersion(m.versionIndex ?? 0);
                                }
                                // Open document view (onViewDocument for mobile, handleOpenDocument for desktop)
                                if (onViewDocument) {
                                  onViewDocument();
                                } else {
                                  handleOpenDocument();
                                }
                              }}
                              className="flex items-center gap-3 w-full hover:bg-muted-foreground/10 cursor-pointer transition-colors rounded-lg py-1"
                            >
                              <ChevronRight size={18} className="text-muted-foreground" />
                              <span className="flex-1 text-left text-foreground">Generated Document</span>
                              <span className="text-sm text-muted-foreground">
                                v{(m.versionIndex ?? 0) + 1}
                              </span>
                            </button>
                          ) : (
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          )}

                          {/* Open Document Button for versions not yet opened */}
                          {isSystem && m.showOpenDocument && m.versionIndex === undefined && (
                            <button
                              onClick={() => onViewDocument ? onViewDocument() : handleOpenDocument()}
                              className="mt-3 flex items-center gap-2 bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 rounded-lg transition-opacity duration-200 text-sm font-medium"
                            >
                              <FileText size={16} />
                              <span>Open Document</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {/* LOADING */}
              {loading && (
                <div className="flex justify-start">
                  {isThinkingEnabled ? (
                    // Think Mode indicator
                    <div className="flex items-center gap-2 py-3 px-1">
                      <Lightbulb size={14} className="text-indigo-400 animate-pulse" />
                      <span className="text-sm text-muted-foreground">
                        Thinking{thinkingElapsed > 0 ? ` for ${thinkingElapsed}s` : '...'}
                      </span>
                    </div>
                  ) : (
                    // Normal bounce dots (unchanged)
                    <div className="flex gap-2 py-4">
                      <span className="w-2.5 h-2.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
                      <span className="w-2.5 h-2.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                      <span className="w-2.5 h-2.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} />
                    </div>
                  )}
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

        {/* ===== MOBILE INPUT BAR ===== */}
        <div className="flex md:hidden items-end gap-3">
          <div className="relative" ref={plusMenuRef}>
            <button
                type="button"
                onClick={() => setShowPlusMenu(v => !v)}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 h-11 w-11 rounded-full justify-center transition-all ${
                    isThinkingEnabled
                        ? 'bg-indigo-500/20 text-indigo-400'
                        : 'bg-neutral-800 text-neutral-500'
                }`}
                title="Options"
            >
              {isThinkingEnabled ? (
                  <Lightbulb size={18} />
              ) : (
                  <img src="/add_icon.svg" alt="Options" className="w-6 h-6" />
              )}
            </button>

            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={handleFileChange} />

            {/* Popover menu — opens upward, same as desktop */}
            <AnimatePresence>
              {showPlusMenu && (
                  <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-full mb-2 left-0 w-44 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-30"
                  >
                    <button
                        type="button"
                        onClick={() => { fileInputRef.current?.click(); setShowPlusMenu(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Paperclip size={15} className="text-muted-foreground" />
                      Add file
                    </button>
                    <div className="h-px bg-border" />
                    <button
                        type="button"
                        onClick={() => { setIsThinkingEnabled(v => !v); setShowPlusMenu(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                            isThinkingEnabled
                                ? 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/15'
                                : 'text-foreground hover:bg-muted'
                        }`}
                    >
                      <Lightbulb size={15} className={isThinkingEnabled ? 'text-indigo-400' : 'text-muted-foreground'} />
                      Thinking
                      {isThinkingEnabled && (
                          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-indigo-400">On</span>
                      )}
                    </button>
                  </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Text input */}
          <div className="flex-1 bg-neutral-800 rounded-3xl px-5 py-3">
            {isThinkingEnabled && (
                <span className="flex items-center gap-1 mb-2 w-fit px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-400/40">
      <Lightbulb size={10} />
      Think
    </span>
            )}
            <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder={selection ? "Edit selected text..." : "Ask notovo"}
                className="w-full bg-transparent text-foreground placeholder:text-neutral-500 focus:outline-none text-base resize-none scrollbar-hide overflow-hidden max-h-40 leading-6"
                style={{ maxHeight: '160px', overflowY: 'auto' }}
            />
          </div>

          {/* Send button */}
          <button
              onClick={handleSend}
              disabled={(loading || isProcessing) || (!input.trim() && !file)}
              className="flex-shrink-0 w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
              title="Send message"
          >
            {(loading || isProcessing) ? (
                <Square size={18} className="text-neutral-500 animate-pulse" />
            ) : (
                <img src="/send_icon.svg" alt="Send" className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* ===== DESKTOP INPUT BAR ===== */}
        <div className="hidden md:block bg-muted rounded-2xl p-1 border border-border transition-all duration-200 hover:border-border/80">
          <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={selection ? "Edit selected text..." : "Ask Notovo..."}
              className="w-full px-5 py-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none text-base overflow-y-scroll max-h-52 scrollbar-hide"
          />

          <div className="flex items-center justify-between px-3 pb-3">
            {/* Left: + button with popover */}
            <div className="relative" ref={plusMenuRef}>
              <button
                type="button"
                onClick={() => setShowPlusMenu(v => !v)}
                className={`flex items-center gap-1.5 p-2 rounded-lg transition-colors duration-200 ${
                  isThinkingEnabled
                    ? 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card'
                }`}
                title="Options"
              >
                <Plus size={18} />
                {isThinkingEnabled && (
                  <span className="flex items-center gap-1 text-xs font-medium">
                    <Lightbulb size={11} />
                    Think
                  </span>
                )}
              </button>

              {/* Hidden file input */}
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={handleFileChange} />

              {/* Popover menu */}
              <AnimatePresence>
                {showPlusMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full mb-2 left-0 w-44 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-30"
                  >
                    <button
                      type="button"
                      onClick={() => { fileInputRef.current?.click(); setShowPlusMenu(false) }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Paperclip size={15} className="text-muted-foreground" />
                      Add file
                    </button>
                    <div className="h-px bg-border" />
                    <button
                      type="button"
                      onClick={() => { setIsThinkingEnabled(v => !v); setShowPlusMenu(false) }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                        isThinkingEnabled
                          ? 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/15'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <Lightbulb size={15} className={isThinkingEnabled ? 'text-indigo-400' : 'text-muted-foreground'} />
                      Thinking
                      {isThinkingEnabled && (
                        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-indigo-400">On</span>
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right: send button */}
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
        <p className="text-[10px] text-neutral-600 text-center py-1 select-none">
          Notovo can make mistakes. Check important info
        </p>
      </div>

      {/* Login Prompt Modal */}
      <LoginPromptModal
        isOpen={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        feature={pendingFeature}
      />
    </div>
  )
}