"use client"

import { useEffect, useRef, useCallback } from "react"
import { EditorView, keymap } from "@codemirror/view"
import { EditorState, Compartment } from "@codemirror/state"
import { markdown } from "@codemirror/lang-markdown"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { oneDark } from "@codemirror/theme-one-dark"
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language"

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  editable?: boolean
}

export function MarkdownEditor({
  value,
  onChange,
  editable = true,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const editableCompartment = useRef(new Compartment())
  const isExternalUpdateRef = useRef(false)

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const handleUpdate = useCallback(
    (update: { docChanged: boolean; state: EditorState }) => {
      if (update.docChanged && !isExternalUpdateRef.current) {
        onChangeRef.current(update.state.doc.toString())
      }
    },
    []
  )

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        syntaxHighlighting(defaultHighlightStyle),
        oneDark,
        editableCompartment.current.of(EditorView.editable.of(editable)),
        EditorView.lineWrapping,
        EditorView.updateListener.of(handleUpdate),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only create editor once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentValue = view.state.doc.toString()
    if (currentValue !== value) {
      isExternalUpdateRef.current = true
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: value,
        },
      })
      isExternalUpdateRef.current = false
    }
  }, [value])

  // Sync editable state
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: editableCompartment.current.reconfigure(
        EditorView.editable.of(editable)
      ),
    })
  }, [editable])

  return (
    <div
      ref={containerRef}
      className="min-h-[400px] rounded-lg border border-border overflow-hidden [&_.cm-editor]:min-h-[400px] [&_.cm-scroller]:min-h-[400px]"
    />
  )
}
