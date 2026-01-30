import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Preset user-facing message when something goes wrong. Never exposes raw errors. */
const GRACEFUL_ERROR_PRESET =
  "We're having a small hiccup on our end. Please try again in a moment."

/**
 * Returns a friendly, preset error message for chat/streaming errors.
 * Use this instead of showing raw error text (e.g. "error while streaming response").
 */
export function getGracefulErrorMessage(e: unknown): string {
  if (e instanceof TypeError && e.message.includes("fetch")) {
    return "We're having trouble connecting. Please check your connection and try again in a moment."
  }
  if (e instanceof Error) {
    const msg = e.message.toLowerCase()
    if (msg.includes("stream") || msg.includes("streaming")) return GRACEFUL_ERROR_PRESET
    if (msg.includes("404") || msg.includes("not found")) return GRACEFUL_ERROR_PRESET
    if (msg.includes("500") || msg.includes("internal server")) return GRACEFUL_ERROR_PRESET
    if (msg.includes("timeout")) return "The request took too long. Please try again in a moment."
    if (msg.includes("failed to fetch") || msg.includes("network")) {
      return "We're having trouble connecting. Please check your connection and try again in a moment."
    }
  }
  return GRACEFUL_ERROR_PRESET
}
