import type { SlashCommand } from "@/hooks/use-slash-command-autocomplete"

/**
 * Built-in slash commands that are always available in every channel.
 * These map to existing UI features (poll creator, GIF picker, etc.)
 * or insert text shortcuts (shrug, tableflip).
 *
 * New commands added here will automatically appear in the autocomplete
 * when a user types `/`.
 */

export interface BuiltInSlashCommand extends SlashCommand {
  /** Distinguishes built-in from app commands during execution. */
  builtIn: true
}

let _nextId = 0
function def(commandName: string, description: string): BuiltInSlashCommand {
  return {
    id: `builtin-${_nextId++}`,
    appId: "builtin",
    appName: "VortexChat",
    commandName,
    description,
    builtIn: true,
  }
}

export const BUILT_IN_SLASH_COMMANDS: BuiltInSlashCommand[] = [
  def("giphy", "Search for a GIF to send"),
  def("gif", "Search for a GIF to send"),
  def("meme", "Search for a meme to send"),
  def("sticker", "Search for a sticker to send"),
  def("poll", "Create a poll in the current channel"),
  def("thread", "Create a new thread"),
  def("shrug", "Appends ¯\\_(ツ)_/¯ to your message"),
  def("tableflip", "Appends (╯°□°)╯︵ ┻━┻ to your message"),
  def("unflip", "Appends ┬─┬ノ( º _ ºノ) to your message"),
  def("lenny", "Appends ( ͡° ͜ʖ ͡°) to your message"),
  def("spoiler", "Wrap your message in a spoiler tag"),
  def("me", "Send an action message (italic)"),
  def("nick", "Change your nickname in this server"),
]

/** Text-insertion commands — returns the text to append/replace, or null if not a text command. */
export function getTextInsertionForBuiltIn(commandName: string, args: string): string | null {
  switch (commandName) {
    case "shrug":
      return args ? `${args} ¯\\_(ツ)_/¯` : "¯\\_(ツ)_/¯"
    case "tableflip":
      return args ? `${args} (╯°□°)╯︵ ┻━┻` : "(╯°□°)╯︵ ┻━┻"
    case "unflip":
      return args ? `${args} ┬─┬ノ( º _ ºノ)` : "┬─┬ノ( º _ ºノ)"
    case "lenny":
      return args ? `${args} ( ͡° ͜ʖ ͡°)` : "( ͡° ͜ʖ ͡°)"
    case "spoiler":
      return args ? `||${args}||` : ""
    case "me":
      return args ? `*${args}*` : ""
    default:
      return null
  }
}
