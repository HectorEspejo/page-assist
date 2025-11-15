import { useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { useStoreMessageOption } from "~/store/option"
import { PageAssistDatabase } from "@/db/dexie/chat"
import { notification } from "antd"
import {
  formatToChatHistory,
  formatToMessage,
  getPromptById,
  getSessionFiles
} from "@/db/dexie/helpers"
import { useStoreChatModelSettings } from "@/store/model"
import { useStorage } from "@plasmohq/storage/hook"
import { updatePageTitle } from "@/utils/update-page-title"

/**
 * Hook to synchronize chat session ID between URL and Zustand store
 * Enables chat sessions to survive page reloads and tab navigation
 */
export const useChatUrlState = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    historyId,
    setHistoryId,
    setHistory,
    setMessages,
    setSelectedSystemPrompt,
    setContextFiles
  } = useStoreMessageOption()
  const { setSystemPrompt } = useStoreChatModelSettings()
  const [isLastUsedChatModel] = useStorage("isLastUsedChatModel", false)
  const [, setSelectedModel] = useStorage("selectedModel")
  const isInitialized = useRef(false)

  /**
   * Update URL when historyId changes in Zustand store
   */
  useEffect(() => {
    // Skip initial mount to avoid conflicts with URL-based loading
    if (!isInitialized.current) {
      return
    }

    const currentChatParam = searchParams.get("chat")

    if (historyId && historyId !== currentChatParam) {
      // Update URL with new chat ID
      setSearchParams({ chat: historyId }, { replace: true })
    } else if (!historyId && currentChatParam) {
      // Clear chat param when historyId is null
      setSearchParams({}, { replace: true })
    }
  }, [historyId, searchParams, setSearchParams])

  /**
   * Load chat from URL on initial mount
   */
  useEffect(() => {
    const loadChatFromUrl = async () => {
      const chatId = searchParams.get("chat")

      if (!chatId) {
        isInitialized.current = true
        return
      }

      // Load full chat data from database
      try {
        const db = new PageAssistDatabase()
        const history = await db.getChatHistory(chatId)
        const historyDetails = await db.getHistoryInfo(chatId)

        if (!historyDetails) {
          // Chat doesn't exist, clear invalid URL
          notification.warning({
            message: "Chat Not Found",
            description: "The requested chat session could not be found."
          })
          setSearchParams({}, { replace: true })
          isInitialized.current = true
          return
        }

        // Load chat data into Zustand store
        setHistoryId(chatId)
        setHistory(formatToChatHistory(history))
        setMessages(formatToMessage(history))

        // Restore last-used model if enabled
        if (isLastUsedChatModel) {
          const currentChatModel = historyDetails?.model_id
          if (currentChatModel) {
            setSelectedModel(currentChatModel)
          }
        }

        // Restore last-used prompt
        const lastUsedPrompt = historyDetails?.last_used_prompt
        if (lastUsedPrompt) {
          if (lastUsedPrompt.prompt_id) {
            const prompt = await getPromptById(lastUsedPrompt.prompt_id)
            if (prompt) {
              setSelectedSystemPrompt(lastUsedPrompt.prompt_id)
              setSystemPrompt(prompt.content)
            }
          } else {
            setSystemPrompt(lastUsedPrompt.prompt_content)
          }
        }

        // Restore session files (document chat context)
        if (setContextFiles) {
          const session = await getSessionFiles(chatId)
          setContextFiles(session)
        }

        // Update page title
        updatePageTitle(historyDetails.title)
      } catch (error) {
        console.error("Error loading chat from URL:", error)
        notification.error({
          message: "Error Loading Chat",
          description: "Failed to load the requested chat session."
        })
        setSearchParams({}, { replace: true })
      }

      isInitialized.current = true
    }

    loadChatFromUrl()
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Update URL with a specific chat ID
   */
  const setChatUrlParam = (chatId: string | null) => {
    if (chatId) {
      setSearchParams({ chat: chatId }, { replace: true })
    } else {
      setSearchParams({}, { replace: true })
    }
  }

  /**
   * Clear chat URL parameter
   */
  const clearChatUrlParam = () => {
    setSearchParams({}, { replace: true })
  }

  return {
    chatIdFromUrl: searchParams.get("chat"),
    setChatUrlParam,
    clearChatUrlParam
  }
}
