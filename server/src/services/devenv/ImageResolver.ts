/**
 * ImageResolver — determines which Docker image to use for a repository.
 *
 * Resolution order:
 * 1. Repo has .devcontainer/devcontainer.json → build via @devcontainers/cli (Phase 5)
 * 2. Auto-detect language from repo root markers
 * 3. Fallback to full image
 */

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';

export type LanguageImage = 'base' | 'node' | 'python' | 'rust' | 'go' | 'full';

interface LanguageMarker {
  files: string[];
  image: LanguageImage;
}

const LANGUAGE_MARKERS: LanguageMarker[] = [
  { files: ['package.json', 'tsconfig.json'], image: 'node' },
  { files: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'], image: 'python' },
  { files: ['Cargo.toml'], image: 'rust' },
  { files: ['go.mod'], image: 'go' },
];

/**
 * Detect the primary language of a repository and return the corresponding image name.
 */
export function resolveImage(repoPath: string): string {
  // Phase 5: Check for devcontainer.json
  const devcontainerPath = path.join(repoPath, '.devcontainer', 'devcontainer.json');
  if (fs.existsSync(devcontainerPath)) {
    // Future: build via @devcontainers/cli
    // For now, fall through to language detection
    console.log(`[ImageResolver] Found devcontainer.json at ${repoPath}, but devcontainer builds not yet supported. Falling back to language detection.`);
  }

  // Detect languages present
  const detectedLanguages: LanguageImage[] = [];

  for (const marker of LANGUAGE_MARKERS) {
    for (const file of marker.files) {
      if (fs.existsSync(path.join(repoPath, file))) {
        if (!detectedLanguages.includes(marker.image)) {
          detectedLanguages.push(marker.image);
        }
        break; // One match per marker group is enough
      }
    }
  }

  // Multiple languages detected → use full image
  if (detectedLanguages.length > 1) {
    console.log(`[ImageResolver] Multiple languages detected for ${repoPath}: ${detectedLanguages.join(', ')} → using full image`);
    return config.devenv.docker.images.full;
  }

  // Single language detected
  if (detectedLanguages.length === 1) {
    const lang = detectedLanguages[0];
    const imageName = config.devenv.docker.images[lang];
    console.log(`[ImageResolver] Detected ${lang} for ${repoPath} → ${imageName}`);
    return imageName;
  }

  // No language markers found → use full image
  console.log(`[ImageResolver] No language markers found for ${repoPath} → using full image`);
  return config.devenv.docker.images.full;
}
