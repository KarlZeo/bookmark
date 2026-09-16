import type { ResolvedConfig } from '../../types/config';
import type { IconMode, IconRegion, RenderContext } from '../../types/render';
import { DEFAULT_ALLOWED_SCHEMES, normalizeAllowedSchemes } from '../../shared/sanitize-url.ts';

const DEFAULT_RENDER_CONTEXT: RenderContext = {
  icons: {
    mode: 'favicon',
    region: 'com',
  },
  allowedSchemes: DEFAULT_ALLOWED_SCHEMES,
};

function normalizeIconMode(value: unknown): IconMode {
  return value === 'manual' ? 'manual' : 'favicon';
}

function normalizeIconRegion(value: unknown): IconRegion {
  return value === 'cn' ? 'cn' : 'com';
}

function createRenderContext(config: ResolvedConfig | null | undefined): RenderContext {
  return {
    icons: {
      mode: normalizeIconMode(config?.icons?.mode),
      region: normalizeIconRegion(config?.icons?.region),
    },
    allowedSchemes: normalizeAllowedSchemes(config?.site?.security?.allowedSchemes),
  };
}

export {
  DEFAULT_ALLOWED_SCHEMES,
  DEFAULT_RENDER_CONTEXT,
  createRenderContext,
  normalizeAllowedSchemes,
  normalizeIconMode,
  normalizeIconRegion,
};
