'use client';

import { useEffect, useMemo } from 'react';
import { getFormattedTextPresetDefinition, normalizeFormattedTextPresetId } from '@/entities/production-graph/model/formatted-text';
import { getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import type { ProductionNode, TextFormatterNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getPlainTextFromArticleRichText, normalizeArticleRichText } from '@/shared/editor-core';
import {
  getPlainTextFromTelegramRichText,
  normalizeTelegramPlainText,
  normalizeTelegramRichText,
  serializeTelegramPlainText,
} from '../lib/telegram-rich-text';
import { textFormatterPresetOptions } from './text-workflow-options';
import { clampTextFormatterEditorHeight, clampTextFormatterNodeWidth } from './text-workflow-values';

export function useTextFormatterNodeModel(node: ProductionNode) {
  const data = node.data as TextFormatterNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const resizeNode = useProductionGraphStore((state) => state.resizeNode);
  const sourceText = useMemo(() => getIncomingTextInputs(node.id, 'text', { edges, nodes })
    .map((input) => input.text).join('\n\n'), [edges, node.id, nodes]);
  const normalizedSourceText = normalizeTelegramPlainText(sourceText);
  const presetId = normalizeFormattedTextPresetId(data.presetId);
  const preset = getFormattedTextPresetDefinition(presetId);
  const usesArticleEditor = presetId === 'markdown' || presetId === 'blog-article' || presetId === 'universal';
  const shouldParseMarkdown = presetId === 'markdown';
  const editorHeight = clampTextFormatterEditorHeight(data.editorHeight);
  const storedPlainText = normalizeTelegramPlainText(data.plainText);
  const normalizedStoredRichText = usesArticleEditor
    ? normalizeArticleRichText(data.richText)
    : normalizeTelegramRichText(data.richText);
  const richTextPlainText = normalizeTelegramPlainText(usesArticleEditor
    ? getPlainTextFromArticleRichText(data.richText)
    : getPlainTextFromTelegramRichText(data.richText));
  const hasIncomingText = normalizedSourceText.length > 0;
  const shouldAdoptSourceText = hasIncomingText
    && normalizeTelegramPlainText(data.sourceText) !== normalizedSourceText;
  const plainText = shouldAdoptSourceText
    ? normalizedSourceText
    : storedPlainText || richTextPlainText || normalizedSourceText;
  const richText = shouldAdoptSourceText
    ? shouldParseMarkdown ? '' : serializeTelegramPlainText(normalizedSourceText)
    : normalizedStoredRichText || (usesArticleEditor ? '' : serializeTelegramPlainText(plainText));
  const sourceCount = hasIncomingText ? 1 : 0;

  useEffect(() => {
    const nextData: Partial<TextFormatterNodeData> = {};
    if (data.editorHeight !== editorHeight) nextData.editorHeight = editorHeight;
    if (data.presetId !== presetId) nextData.presetId = presetId;
    if (data.result !== plainText) nextData.result = plainText;
    if (data.sourceCount !== sourceCount) nextData.sourceCount = sourceCount;
    if (shouldAdoptSourceText || data.sourceText !== normalizedSourceText) nextData.sourceText = normalizedSourceText;
    if (shouldAdoptSourceText || data.plainText !== plainText) nextData.plainText = plainText;
    if (shouldAdoptSourceText || normalizedStoredRichText !== richText) nextData.richText = richText;
    if (Object.keys(nextData).length > 0) updateNodeDataSilent(node.id, nextData);
  }, [data.editorHeight, data.plainText, data.presetId, data.result, data.sourceCount, data.sourceText, editorHeight, node.id, normalizedSourceText, normalizedStoredRichText, plainText, presetId, richText, shouldAdoptSourceText, sourceCount, updateNodeDataSilent]);

  return {
    data,
    editorHeight,
    handleEditorChange: (value: { plainText: string; richText: string }) => updateNodeData(node.id, {
      plainText: value.plainText,
      result: value.plainText,
      richText: value.richText,
      sourceText: normalizedSourceText,
    }),
    handleEditorHeightChange: (height: number) => updateNodeData(node.id, {
      editorHeight: clampTextFormatterEditorHeight(height),
    }),
    handleNodeWidthChange: (width: number) => resizeNode(node.id, { width: clampTextFormatterNodeWidth(width) }),
    handlePresetChange: (value: string) => {
      const nextPresetId = normalizeFormattedTextPresetId(value);
      updateNodeData(node.id, nextPresetId === 'markdown'
        ? { presetId: nextPresetId, richText: '', sourceText: '' }
        : { presetId: nextPresetId });
    },
    hasIncomingText,
    plainText,
    preset,
    presetId,
    presetOptions: textFormatterPresetOptions,
    richText,
    shouldParseMarkdown,
    sourceCount,
    sourceText: normalizedSourceText,
    usesArticleEditor,
  };
}
