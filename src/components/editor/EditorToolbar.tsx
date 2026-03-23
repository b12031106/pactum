"use client"

import { memo, useState, useRef, useEffect } from "react"
import type { Editor } from "@tiptap/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Undo2,
  Redo2,
  ChevronDown,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link2,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
  Code2,
} from "lucide-react"

interface EditorToolbarProps {
  editor: Editor | null
}

function ToolbarButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-active={active}
      className="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
    >
      {icon}
    </Button>
  )
}

function Divider() {
  return <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />
}

function BlockTypeDropdown({ editor }: { editor: Editor }) {
  const currentType = editor.isActive("heading", { level: 1 })
    ? "Heading 1"
    : editor.isActive("heading", { level: 2 })
      ? "Heading 2"
      : editor.isActive("heading", { level: 3 })
        ? "Heading 3"
        : "Paragraph"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="min-w-[100px] justify-between gap-1">
            {currentType}
            <ChevronDown className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
          Paragraph
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          Heading 1
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          Heading 2
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          Heading 3
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
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

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
      {/* Group 1: History */}
      <ToolbarButton
        icon={<Undo2 />}
        label="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      />
      <ToolbarButton
        icon={<Redo2 />}
        label="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      />

      <Divider />

      {/* Group 2: Block Type */}
      <BlockTypeDropdown editor={editor} />

      <Divider />

      {/* Group 3: Text Format */}
      <ToolbarButton icon={<Bold />} label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton icon={<Italic />} label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton icon={<Underline />} label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <ToolbarButton icon={<Strikethrough />} label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <ToolbarButton icon={<Code />} label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} />
      <ToolbarButton icon={<Link2 />} label="Link" active={editor.isActive("link")} onClick={() => setLinkOpen(true)} />

      <Divider />

      {/* Group 4: Lists & Blocks */}
      <ToolbarButton icon={<List />} label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton icon={<ListOrdered />} label="Ordered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarButton icon={<Quote />} label="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />

      <Divider />

      {/* Group 5: Align */}
      <ToolbarButton icon={<AlignLeft />} label="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} />
      <ToolbarButton icon={<AlignCenter />} label="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} />
      <ToolbarButton icon={<AlignRight />} label="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} />

      <Divider />

      {/* Group 6: Insert */}
      <ToolbarButton icon={<Minus />} label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      <ToolbarButton icon={<Code2 />} label="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />

      {/* Link Popover */}
      {linkOpen && <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />}
    </div>
  )
})
