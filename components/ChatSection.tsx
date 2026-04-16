"use client"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Square, Paperclip, ArrowUpCircle, FileText, X, Upload, ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useUIState } from "@/hooks/useUIState"
import { useChatStorage } from "@/hooks/useChatStorage"
import { UserDocument } from "@/lib/supabase"
import { useAuth } from "@/hooks/AuthContext"
import LoginPromptModal from "@/components/LoginPromptModal"
import { classifyIntent, IntentType } from "@/lib/intentTypes"
import Image from "next/image"
import { Plus, Check } from "lucide-react"
import { PlanningStepsDisplay } from "@/components/ui/planning-steps-display"
import { ThinkingBar } from "@/components/ui/thinking-bar"
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

export default function Chat({ setDocumentBlocks, documentBlocks, onSaveUploadedDocument, currentVersionIndex, totalVersions, onSwitchToVersion, onViewDocument }: ChatSectionProps) {
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

  const [isThinkingMode, setIsThinkingMode] = useState(false)
  const [isPlanningMode, setIsPlanningMode] = useState(false)
  const [showModes, setShowModes] = useState(false)
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

  const handleChatOnly = async (userMessage: { role: "user" | "assistant"; content: string }) => {
    setLoading(true)
    try {
      if (isThinkingMode) {
        const res = await fetch("/api/thinking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [...getMessagesForAPI(messages), { role: "user", content: userMessage.content }] }),
        })
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
        const data = await res.json()
        await addMessage({ role: "assistant", content: data.output || "Sorry, something went wrong." })
        return
      }

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
      if (isThinkingMode) {
        const res = await fetch("/api/thinking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [...getMessagesForAPI(messages), { role: "user", content: userMessage.content }] }),
        })
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
        const data = await res.json()
        const assistantText = data.output || ""

        if (!assistantText.trim()) {
          await addMessage({ role: "assistant", content: "⚠️ Couldn't generate content. Please try again with a different prompt." })
          return
        }

        const paragraphs = assistantText.split("\n\n").filter((p: string) => p.trim())
        const newBlocks = paragraphs.map((p: string, i: number) => ({
          id: `block-${Date.now()}-${i}`,
          type: "paragraph" as const,
          content: p.trim(),
        }))

        if (newBlocks.length > 0) {
          setDocumentBlocks((prev) => [...prev, ...newBlocks])
          setHasDocument(true)
          await addMessage({ role: "system", content: "", showOpenDocument: true, versionIndex: totalVersions ?? 0 })
        } else {
          await addMessage({ role: "assistant", content: assistantText })
        }
        return
      }

      if (isPlanningMode) {
        const res = await fetch("/api/planning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [...getMessagesForAPI(messages), { role: "user", content: userMessage.content }] }),
        })
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
        const data = await res.json()
        const assistantText = data.output || ""

        if (!assistantText.trim()) {
          await addMessage({ role: "assistant", content: "⚠️ Couldn't generate content. Please try again with a different prompt." })
          return
        }

        const paragraphs = assistantText.split("\n\n").filter((p: string) => p.trim())
        const newBlocks = paragraphs.map((p: string, i: number) => ({
          id: `block-${Date.now()}-${i}`,
          type: "paragraph" as const,
          content: p.trim(),
        }))

        if (newBlocks.length > 0) {
          setDocumentBlocks((prev) => [...prev, ...newBlocks])
          setHasDocument(true)
          await addMessage({ role: "system", content: "", showOpenDocument: true, versionIndex: totalVersions ?? 0 })
        } else {
          await addMessage({ role: "assistant", content: assistantText })
        }
        return
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
          "\n" +
          "Constraints:\n" +
          "- Do not invent new formatting types.\n" +
          "- Do not nest headings incorrectly.\n" +
          "- Do not overuse emphasis or strong text.\n" +
          "- Keep paragraphs concise and readable.\n" +
          "- Prefer clarity and hierarchy over decoration.\n"
      }

      let res: Response

      if (file) {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("messages", JSON.stringify([...getMessagesForAPI(messages), { role: 'user', content: userMessage.content }]))

        res = await fetch("/api/chat", { method: "POST", body: formData })

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

      if (!assistantText || !assistantText.trim()) {
        await addMessage({ role: "assistant", content: "⚠️ Couldn't generate content. Please try again with a different prompt." })
        return
      }

      const newBlock = {
        id: `block-${Date.now()}-0`,
        type: "paragraph" as const,
        content: assistantText.trim(),
      }

      setDocumentBlocks((prev) => [...prev, newBlock])
      setHasDocument(true)

      await addMessage({ role: "system", content: "", showOpenDocument: true, versionIndex: totalVersions ?? 0 })
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

    // Thinking / Planning modes bypass local classification entirely.
    // The pipeline classifies intent internally and returns it so we know
    // whether to put the output into the document or the chat.
    if (isThinkingMode || isPlanningMode) {
      setLoading(true)
      try {
        const endpoint = isThinkingMode ? "/api/thinking" : "/api/planning"
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...getMessagesForAPI(messages), { role: "user", content: userMessage.content }],
          }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const output = (data.output || "").trim()
        const pipelineIntent: string = data.intent || ""

        if (!output) {
          await addMessage({ role: "assistant", content: "⚠️ Couldn't generate content. Please try again." })
          return
        }

        const isNotesOutput = isThinkingMode
          ? pipelineIntent === "notes"
          : pipelineIntent === "notes_generation"

        if (isNotesOutput) {
          const newBlock = {
            id: `block-${Date.now()}-0`,
            type: "paragraph" as const,
            content: output,
          }
          setDocumentBlocks((prev) => [...prev, newBlock])
          setHasDocument(true)
          await addMessage({ role: "system", content: "", showOpenDocument: true, versionIndex: totalVersions ?? 0 })
        } else {
          await addMessage({ role: "assistant", content: output })
        }
      } catch (err) {
        console.error(err)
        await addMessage({ role: "assistant", content: "⚠️ Something went wrong. Please try again." })
      } finally {
        setLoading(false)
      }
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

  // Truncate text for selection preview
  const truncateText = (text: string, maxLength = 100) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + "..."
  }
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'





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
                <div className="flex justify-start w-full">
                  {isPlanningMode ? (
                    <PlanningStepsDisplay isRunning={loading} />
                  ) : isThinkingMode ? (
                    <div className="py-4 w-full max-w-xs">
                      <ThinkingBar text="Thinking..." />
                    </div>
                  ) : (
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
      <div className="w-full max-w-2xl mx-auto px-4 pb-4 self-center relative">
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
        <div className="flex md:hidden items-center gap-2">
          {/* Modes button */}
          <div className="relative">
            <button
              onClick={() => setShowModes(!showModes)}
              className="flex-shrink-0 w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
              title="More modes"
            >
              <Plus size={20} className="text-neutral-400" />
            </button>
            <AnimatePresence>
              {showModes && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full mb-2 left-0 w-48 bg-neutral-800 border border-neutral-700 rounded-xl shadow-lg overflow-hidden z-20"
                >
                  <button
                    onClick={() => {
                      setIsThinkingMode(!isThinkingMode)
                      if (!isThinkingMode) setIsPlanningMode(false)
                      setShowModes(false)
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-neutral-700 text-sm flex justify-between items-center text-neutral-200"
                  >
                    Thinking Mode {isThinkingMode && <Check size={16} className="text-primary" />}
                  </button>
                  <button
                    onClick={() => {
                      setIsPlanningMode(!isPlanningMode)
                      if (!isPlanningMode) setIsThinkingMode(false)
                      setShowModes(false)
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-neutral-700 text-sm flex justify-between items-center text-neutral-200 border-t border-neutral-700"
                  >
                    Planning Mode {isPlanningMode && <Check size={16} className="text-primary" />}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Add / Attach button */}
          <label
            className="flex-shrink-0 w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
            title="Attach file"
          >
            <img src="/add_icon.svg" alt="Attach" className="w-6 h-6" />
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={handleFileChange} />
          </label>

          {/* Text input */}
          <div className="flex-1 bg-neutral-800 rounded-full px-5 py-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selection ? "Edit selected text..." : "Ask notovo"}
              className="w-full bg-transparent text-foreground placeholder:text-neutral-500 focus:outline-none text-base"
            />
          </div>

          {/* Thinking mode badge — mobile */}
          {isThinkingMode && (
            <AnimatePresence>
              <motion.span
                key="thinking-badge-mobile"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="text-sm text-muted-foreground select-none whitespace-nowrap"
              >
                Thinking
              </motion.span>
            </AnimatePresence>
          )}
          {isPlanningMode && (
            <AnimatePresence>
              <motion.span
                key="planning-badge-mobile"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="text-sm text-muted-foreground select-none whitespace-nowrap"
              >
                Planning
              </motion.span>
            </AnimatePresence>
          )}

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

        {/* ===== DESKTOP INPUT BAR (unchanged) ===== */}
        <div className="hidden md:block bg-muted rounded-2xl p-1 border border-border transition-all duration-200 hover:border-border/80 focus-within:border-primary/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={selection ? "Edit selected text..." : "Ask Notovo..."}
            className="w-full px-5 py-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none text-base"
          />

          <div className="flex items-center justify-between px-3 pb-3 relative">
            <div className="flex items-center gap-1">
              {/* Modes button desktop */}
              <div className="relative">
                <button
                  onClick={() => setShowModes(!showModes)}
                  className="cursor-pointer p-2 text-muted-foreground hover:text-foreground hover:bg-card rounded-lg transition-colors duration-200"
                  title="Modes"
                >
                  <Plus size={20} />
                </button>
                <AnimatePresence>
                  {showModes && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full mb-2 left-0 w-56 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-20"
                    >
                      <button
                        onClick={() => {
                          setIsThinkingMode(!isThinkingMode)
                          if (!isThinkingMode) setIsPlanningMode(false)
                          setShowModes(false)
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-muted text-sm flex justify-between items-center text-foreground"
                      >
                        Thinking Mode {isThinkingMode && <Check size={16} className="text-primary" />}
                      </button>
                      <button
                        onClick={() => {
                          setIsPlanningMode(!isPlanningMode)
                          if (!isPlanningMode) setIsThinkingMode(false)
                          setShowModes(false)
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-muted text-sm flex justify-between items-center text-foreground border-t border-border"
                      >
                        Planning Mode {isPlanningMode && <Check size={16} className="text-primary" />}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <label
                className="cursor-pointer p-2 text-muted-foreground hover:text-foreground hover:bg-card rounded-lg transition-colors duration-200"
                title="Attach file"
              >
                <Paperclip size={20} />
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={handleFileChange} />
              </label>
            </div>

            {/* Mode badges — desktop */}
            <div className="flex items-center gap-3">
              {isThinkingMode && (
                <AnimatePresence>
                  <motion.span
                    key="thinking-badge-desktop"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="text-sm text-muted-foreground select-none"
                  >
                    Thinking
                  </motion.span>
                </AnimatePresence>
              )}
              {isPlanningMode && (
                <AnimatePresence>
                  <motion.span
                    key="planning-badge-desktop"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="text-sm text-muted-foreground select-none"
                  >
                    Planning
                  </motion.span>
                </AnimatePresence>
              )}

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