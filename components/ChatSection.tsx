"use client"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Square, Paperclip, ArrowUpCircle, FileText, X, Upload, Info, ChevronRight, AlertTriangle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useUIState } from "@/hooks/useUIState"
import { useChatStorage } from "@/hooks/useChatStorage"
import { UserDocument } from "@/lib/supabase"
import { useAuth } from "@/hooks/AuthContext"
import LoginPromptModal from "@/components/LoginPromptModal"
import { classifyIntent, IntentType } from "@/lib/intentTypes"

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
}

export default function Chat({ setDocumentBlocks, documentBlocks, onSaveUploadedDocument, currentVersionIndex, totalVersions, onSwitchToVersion }: ChatSectionProps) {
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

  useEffect(() => {
    // Auto scroll to bottom when messages change
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages])

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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Send the original Markdown so AI can preserve formatting
          selectedText: currentSelection.originalMarkdown,
          command: editCommand
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
      // Note: totalVersions is the count before this edit, so it becomes the new version index
      await addMessage({
        role: "system",
        content: "",
        showOpenDocument: true,
        versionIndex: totalVersions ?? 0,
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
      const chatInstruction = {
        role: "system",
        content: "You are a helpful AI assistant. Keep your responses concise and conversational. Rules:\n" +
          "- Use plain text ONLY - no markdown formatting\n" +
          "- NO tables, code blocks, or equations\n" +
          "- NO bullet points or numbered lists\n" +
          "- Keep answers brief and to the point\n" +
          "- Do NOT generate document content or notes\n" +
          "- If user asks for document/notes generation, politely ask them to rephrase with 'generate notes' or 'create document'"
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [chatInstruction, ...getMessagesForAPI(messages), { role: 'user', content: userMessage.content }] }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        assistantText += decoder.decode(value, { stream: true })
      }
      assistantText += new TextDecoder().decode()

      // Add response to chat ONLY (not document)
      await addMessage({ role: "assistant", content: assistantText })
    } catch (err) {
      console.error(err)
      await addMessage({ role: "assistant", content: "Sorry, something went wrong." })
    } finally {
      setLoading(false)
    }
  }

  // Handle DOCUMENT_CREATE intent - generate content for document
  const handleDocumentCreate = async (userMessage: { role: "user" | "assistant"; content: string }) => {
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
        "\n" +
        "Constraints:\n" +
        "- Do not invent new formatting types.\n" +
        "- Do not nest headings incorrectly.\n" +
        "- Do not overuse emphasis or strong text.\n" +
        "- Keep paragraphs concise and readable.\n" +
        "- Prefer clarity and hierarchy over decoration.\n"
    }

    setLoading(true)
    try {
      let res: Response

      if (file) {
        // File metadata is now passed via the userMessage in handleSend
        // No need to track separately as it's persisted with the message

        // Send with file using FormData (strip metadata from messages)
        const formData = new FormData()
        formData.append("file", file)
        formData.append("messages", JSON.stringify([...getMessagesForAPI(messages), { role: 'user', content: userMessage.content }]))

        res = await fetch("/api/chat", {
          method: "POST",
          body: formData,
        })

        // Save uploaded file to Supabase (3hr TTL for logged-in, 1hr for guests)
        if (onSaveUploadedDocument) {
          const fileSize = file.size
          const userId = user?.id
          const reader = new FileReader()
          reader.onload = async (e) => {
            const content = e.target?.result as string
            await onSaveUploadedDocument(file.name, content, file.type, fileSize, userId)
          }
          reader.readAsText(file)
        }

        setProcessedFile(file)
        setFile(null)
        setDocumentReady(true)
        setShowReuploadPrompt(false)
      } else {
        // Send without file using JSON (strip metadata from messages)
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [systemInstruction, ...getMessagesForAPI(messages), { role: 'user', content: userMessage.content }] }),
        })
      }

      if (!res.ok || !res.body) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        assistantText += decoder.decode(value, { stream: true })
      }
      assistantText += new TextDecoder().decode()

      // Check if AI returned empty content
      if (!assistantText || !assistantText.trim()) {
        await addMessage({
          role: "assistant",
          content: "⚠️ Couldn't generate content. Please try again with a different prompt."
        });
        return;
      }

      // Add to document (not chat)
      const paragraphs = assistantText.split("\n\n").filter((p: string) => p.trim())
      const newBlocks = paragraphs.map((p: string, i: number) => ({
        id: `block-${Date.now()}-${i}`,
        type: "paragraph" as const,
        content: p.trim(),
      }))

      if (newBlocks.length === 0) {
        await addMessage({
          role: "assistant",
          content: "⚠️ Couldn't generate content. Please try again with a different prompt."
        });
        return;
      }

      setDocumentBlocks((prev) => [...prev, ...newBlocks])
      setHasDocument(true)

      // Notify in chat with version info
      // Note: The version will be created by MainContent after setDocumentBlocks triggers the version creation
      // We use totalVersions as the new version index (0-indexed, so totalVersions = next index)
      await addMessage({
        role: "system",
        content: "",  // Content is replaced by custom rendering
        showOpenDocument: true,
        versionIndex: totalVersions ?? 0,  // This will be the new version's index
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
        hasDocument || documentBlocks.length > 0
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
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'





  return (
    <div
      className={`flex-1 flex flex-col h-full bg-background text-foreground border-r border-border rounded-2xl relative transition-all duration-200 ${isDragging ? 'ring-2 ring-primary ring-inset' : ''}`}
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
              className="flex-1 flex flex-col justify-center px-4 py-8"
            >
              <h1 className="text-5xl md:text-2xl font-semibold tracking-tight text-foreground mb-3">Hi {displayName}</h1>
              <p className="text-lg md:text-6xl text-muted-foreground">Where should we start?</p>

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
                                // Always allow clicking - even if current, user may want to open document
                                // Switch to this version (will be no-op if already current)
                                if (onSwitchToVersion) {
                                  onSwitchToVersion(m.versionIndex ?? 0);
                                }
                                // If in chat mode, open document
                                if (uiMode === "chat") {
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
                          {isSystem && m.showOpenDocument && uiMode === "chat" && m.versionIndex === undefined && (
                            <button
                              onClick={handleOpenDocument}
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
        <p className="text-[10px] text-neutral-600 text-center py-1 select-none">
          Notovo can make mistakes. Verify important information.
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