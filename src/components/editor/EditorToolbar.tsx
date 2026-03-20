"use client"

import { memo, useState, useRef, useEffect } from "react"
import type { Editor } from "@tiptap/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface EditorToolbarProps {
  editor: Editor | null
}

function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState(editor.getAttributes("link").href ?? "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const apply = () => {
    if (url.trim()) {
      editor.chain().focus().setLink({ href: url.trim() }).run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
    onClose()
  }

  return (
    <div className="flex items-center gap-1.5 animate-fade-in">
      <Input
        ref={inputRef}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); apply() }
          if (e.key === "Escape") { onClose(); editor.chain().focus().run() }
        }}
        placeholder="https://..."
        className="h-7 w-48 text-xs"
      />
      <Button type="button" size="xs" onClick={apply}>
        Apply
      </Button>
      <Button type="button" size="xs" variant="ghost" onClick={() => { onClose(); editor.chain().focus().run() }}>
        Cancel
      </Button>
    </div>
  )
}

export const EditorToolbar = memo(function EditorToolbar({ editor }: EditorToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false)

  if (!editor) return null

  const items = [
    {
      label: "H1",
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: () => editor.isActive("heading", { level: 1 }),
    },
    {
      label: "H2",
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: () => editor.isActive("heading", { level: 2 }),
    },
    {
      label: "H3",
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: () => editor.isActive("heading", { level: 3 }),
    },
    {
      label: "Bold",
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: () => editor.isActive("bold"),
    },
    {
      label: "Italic",
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: () => editor.isActive("italic"),
    },
    {
      label: "Strike",
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: () => editor.isActive("strike"),
    },
    {
      label: "UL",
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: () => editor.isActive("bulletList"),
    },
    {
      label: "OL",
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: () => editor.isActive("orderedList"),
    },
    {
      label: "Quote",
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: () => editor.isActive("blockquote"),
    },
    {
      label: "Code",
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: () => editor.isActive("codeBlock"),
    },
    {
      label: "HR",
      action: () => editor.chain().focus().setHorizontalRule().run(),
      isActive: () => false,
    },
    {
      label: "Link",
      action: () => setLinkOpen(true),
      isActive: () => editor.isActive("link"),
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
      {items.map((item) => (
        <Button
          key={item.label}
          type="button"
          size="sm"
          variant={item.isActive() ? "default" : "outline"}
          onClick={item.action}
        >
          {item.label}
        </Button>
      ))}
      {linkOpen && (
        <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />
      )}
    </div>
  )
})
