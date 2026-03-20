"use client"

import { Button } from "@/components/ui/button"

type EditorMode = "richtext" | "markdown"

interface ModeToggleProps {
  mode: EditorMode
  onToggle: (mode: EditorMode) => void
}

export function ModeToggle({ mode, onToggle }: ModeToggleProps) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        size="sm"
        variant={mode === "richtext" ? "default" : "outline"}
        onClick={() => onToggle("richtext")}
      >
        Rich Text
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "markdown" ? "default" : "outline"}
        onClick={() => onToggle("markdown")}
      >
        Markdown
      </Button>
    </div>
  )
}
