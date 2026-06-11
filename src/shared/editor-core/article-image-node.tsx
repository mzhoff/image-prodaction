'use client';

import type { JSX } from 'react';
import { DecoratorNode, type EditorConfig, type LexicalNode, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical';

export type SerializedArticleImageNode = Spread<{
  alt: string;
  src: string;
  type: 'article-image';
  version: 1;
}, SerializedLexicalNode>;

export class ArticleImageNode extends DecoratorNode<JSX.Element> {
  __alt: string;
  __src: string;

  static getType() {
    return 'article-image';
  }

  static clone(node: ArticleImageNode) {
    return new ArticleImageNode(node.__src, node.__alt, node.__key);
  }

  static importJSON(serializedNode: SerializedArticleImageNode) {
    return $createArticleImageNode(serializedNode.src, serializedNode.alt);
  }

  constructor(src: string, alt = '', key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__alt = alt;
  }

  createDOM(_config: EditorConfig) {
    const element = document.createElement('div');
    element.className = 'article-editor-image-node';
    return element;
  }

  updateDOM() {
    return false;
  }

  exportJSON(): SerializedArticleImageNode {
    return {
      ...super.exportJSON(),
      alt: this.__alt,
      src: this.__src,
      type: 'article-image',
      version: 1,
    };
  }

  getTextContent() {
    return this.__alt ? `[Image: ${this.__alt}]` : '[Image]';
  }

  decorate() {
    return (
      <figure className="article-editor-image-figure">
        <img src={this.__src} alt={this.__alt} draggable={false} />
        {this.__alt ? <figcaption>{this.__alt}</figcaption> : null}
      </figure>
    );
  }
}

export function $createArticleImageNode(src: string, alt = '') {
  return new ArticleImageNode(src, alt);
}

export function $isArticleImageNode(node: LexicalNode | null | undefined): node is ArticleImageNode {
  return node instanceof ArticleImageNode;
}
