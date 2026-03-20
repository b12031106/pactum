"use client"

import { useEffect, useRef } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { Image } from "@tiptap/extension-image"
import { Link } from "@tiptap/extension-link"
import { Placeholder } from "@tiptap/extension-placeholder"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { Markdown } from "tiptap-markdown"
import { common, createLowlight } from "lowlight"
import { EditorToolbar } from "./EditorToolbar"

const lowlight = createLowlight(common)

interface TiptapEditorProps {
  content: unknown
  onUpdate: (json: unknown) => void
  onEditorReady?: (editor: Editor) => void
  editable?: boolean
  placeholder?: string
}

export function TiptapEditor({
  content,
  onUpdate,
  onEditorReady,
  editable = true,
  placeholder = "Start writing...",
}: TiptapEditorProps) {
  const contentSetRef = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      Markdown,
    ],
    editable,
    onCreate({ editor: createdEditor }) {
      onEditorReady?.(createdEditor)
    },
    onUpdate({ editor: updatedEditor }) {
      onUpdate(updatedEditor.getJSON())
    },
  })

  useEffect(() => {
    if (editor && content && !contentSetRef.current) {
      contentSetRef.current = true
      editor.commands.setContent(content as Parameters<typeof editor.commands.setContent>[0])
    }
  }, [editor, content])

  return (
    <div className="rounded-lg border border-border">
      <EditorToolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none min-h-[400px] p-4 focus:outline-none"
      />
    </div>
  )
}
