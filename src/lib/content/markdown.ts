import MarkdownItModule from 'markdown-it';
import { normalizeAllowedSchemes, sanitizeUrlOrHash } from '../../shared/sanitize-url.ts';

type MarkdownItToken = {
  attrs: [string, string][] | null;
  attrIndex: (name: string) => number;
};

type MarkdownRendererRule = (
  tokens: MarkdownItToken[],
  idx: number,
  options: unknown,
  env: unknown,
  self: { renderToken: (tokens: MarkdownItToken[], idx: number, options: unknown) => string }
) => string;

type MarkdownItInstance = {
  validateLink: (url: string) => boolean;
  disable: (rule: string) => void;
  render: (markdownText: string) => string;
  renderer: {
    rules: {
      link_open?: MarkdownRendererRule;
    };
  };
};

type MarkdownItConstructor = new (options: Record<string, unknown>) => MarkdownItInstance;

const MarkdownIt = MarkdownItModule as MarkdownItConstructor;

function sanitizeLinkHref(href: unknown, allowedSchemes: string[]): string {
  return sanitizeUrlOrHash(href, { allowedSchemes });
}

function createMarkdownIt({ allowedSchemes }: { allowedSchemes: unknown }): MarkdownItInstance {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  });

  markdown.validateLink = () => true;
  markdown.disable('image');

  const normalizedSchemes = normalizeAllowedSchemes(allowedSchemes);
  const defaultRender = markdown.renderer.rules.link_open;

  markdown.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');
    if (hrefIndex >= 0 && token.attrs) {
      const originalHref = token.attrs[hrefIndex][1];
      token.attrs[hrefIndex][1] = sanitizeLinkHref(originalHref, normalizedSchemes);
    }

    return defaultRender
      ? defaultRender(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  return markdown;
}

function renderMarkdownToHtml(
  markdownText: unknown,
  opts: { allowedSchemes?: unknown } = {}
): string {
  const markdown = createMarkdownIt({ allowedSchemes: opts.allowedSchemes });
  return markdown.render(String(markdownText || ''));
}

export { sanitizeLinkHref, renderMarkdownToHtml };
