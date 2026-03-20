"use client"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/context"

type EditorMode = "richtext" | "markdown"

interface ModeToggleProps {
  mode: EditorMode
  onToggle: (mode: EditorMode) => void
}

export function ModeToggle({ mode, onToggle }: ModeToggleProps) {
  const { t } = useI18n()

  return (
    <div className="flex gap-1" role="group" aria-label={t('editor.modeLabel')}>
      <Button
        type="button"
        size="sm"
        variant={mode === "richtext" ? "default" : "outline"}
        onClick={() => onToggle("richtext")}
        aria-pressed={mode === "richtext"}
      >
        {t('editor.richText')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "markdown" ? "default" : "outline"}
        onClick={() => onToggle("markdown")}
        aria-pressed={mode === "markdown"}
      >
        {t('editor.markdown')}
      </Button>
    </div>
  )
}
