import * as fs from 'fs';
import * as path from 'path';
import { ProjectContext } from '../types';
import { logger } from '../utils/logger';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

const FRAMEWORK_DETECTION: Record<string, { packages: string[]; name: string }> = {
  react: { packages: ['react', 'react-dom'], name: 'React' },
  nextjs: { packages: ['next'], name: 'Next.js' },
  vue: { packages: ['vue'], name: 'Vue.js' },
  nuxt: { packages: ['nuxt'], name: 'Nuxt' },
  angular: { packages: ['@angular/core'], name: 'Angular' },
  svelte: { packages: ['svelte'], name: 'Svelte' },
  express: { packages: ['express'], name: 'Express' },
  fastify: { packages: ['fastify'], name: 'Fastify' },
  nestjs: { packages: ['@nestjs/core'], name: 'NestJS' },
  django: { packages: ['django'], name: 'Django' },
  flask: { packages: ['flask'], name: 'Flask' },
  fastapi: { packages: ['fastapi'], name: 'FastAPI' },
};

const TEST_FRAMEWORK_DETECTION: Record<string, { packages: string[]; name: string }> = {
  jest: { packages: ['jest', '@jest/core'], name: 'Jest' },
  mocha: { packages: ['mocha'], name: 'Mocha' },
  vitest: { packages: ['vitest'], name: 'Vitest' },
  pytest: { packages: ['pytest'], name: 'Pytest' },
  jasmine: { packages: ['jasmine'], name: 'Jasmine' },
  playwright: { packages: ['@playwright/test', 'playwright'], name: 'Playwright' },
  cypress: { packages: ['cypress'], name: 'Cypress' },
};

const PATTERN_INDICATORS: Record<string, { files: string[]; dirs: string[]; name: string }> = {
  'uses-hooks': { files: ['use*.ts', 'use*.tsx', 'use*.js'], dirs: ['hooks'], name: 'React Hooks' },
  'mvc': { files: [], dirs: ['models', 'views', 'controllers'], name: 'MVC' },
  'repository-pattern': { files: ['*Repository.ts', '*Repository.js'], dirs: ['repositories'], name: 'Repository Pattern' },
  'service-layer': { files: ['*Service.ts', '*Service.js'], dirs: ['services'], name: 'Service Layer' },
  'redux': { files: ['*Slice.ts', '*Reducer.ts'], dirs: ['store', 'slices', 'reducers'], name: 'Redux' },
  'zustand': { files: ['*Store.ts', '*store.ts'], dirs: ['store', 'stores'], name: 'Zustand' },
};

export async function extractProjectContext(repoPath: string): Promise<ProjectContext> {
  logger.debug(`Extracting project context from: ${repoPath}`);
  
  const context: ProjectContext = {
    language: 'Unknown',
    patterns: [],
    conventions: {},
    dependencies: [],
  };

  try {
    // Detect language and dependencies from package.json (Node.js projects)
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as PackageJson;
      context.language = 'TypeScript/JavaScript';
      
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };
      context.dependencies = Object.keys(allDeps);

      // Detect TypeScript
      if (allDeps['typescript']) {
        context.language = 'TypeScript';
      }

      // Detect framework
      for (const [, detection] of Object.entries(FRAMEWORK_DETECTION)) {
        if (detection.packages.some(pkg => allDeps[pkg])) {
          context.framework = detection.name;
          break;
        }
      }

      // Detect test framework
      for (const [, detection] of Object.entries(TEST_FRAMEWORK_DETECTION)) {
        if (detection.packages.some(pkg => allDeps[pkg])) {
          context.testFramework = detection.name;
          break;
        }
      }
    }

    // Detect Python projects
    const requirementsPath = path.join(repoPath, 'requirements.txt');
    const pyprojectPath = path.join(repoPath, 'pyproject.toml');
    if (fs.existsSync(requirementsPath) || fs.existsSync(pyprojectPath)) {
      context.language = 'Python';
      
      if (fs.existsSync(requirementsPath)) {
        const requirements = fs.readFileSync(requirementsPath, 'utf-8');
        context.dependencies = requirements
          .split('\n')
          .filter(line => line.trim() && !line.startsWith('#'))
          .map(line => line.split('==')[0].split('>=')[0].split('<=')[0].trim());

        // Detect Python frameworks
        if (requirements.includes('django')) context.framework = 'Django';
        else if (requirements.includes('flask')) context.framework = 'Flask';
        else if (requirements.includes('fastapi')) context.framework = 'FastAPI';

        // Detect Python test frameworks
        if (requirements.includes('pytest')) context.testFramework = 'Pytest';
        else if (requirements.includes('unittest')) context.testFramework = 'unittest';
      }
    }

    // Detect Go projects
    const goModPath = path.join(repoPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      context.language = 'Go';
      const goMod = fs.readFileSync(goModPath, 'utf-8');
      const requireMatches = goMod.matchAll(/require\s+([^\s]+)/g);
      context.dependencies = Array.from(requireMatches).map(m => m[1]);
    }

    // Detect patterns by scanning directory structure
    context.patterns = await detectPatterns(repoPath);

    // Detect naming conventions by sampling files
    context.conventions = await detectConventions(repoPath);

    logger.debug(`Extracted context: ${JSON.stringify(context, null, 2)}`);
  } catch (error) {
    logger.warn(`Failed to extract project context: ${(error as Error).message}`);
  }

  return context;
}

async function detectPatterns(repoPath: string): Promise<string[]> {
  const patterns: string[] = [];
  
  try {
    const srcPath = path.join(repoPath, 'src');
    const basePath = fs.existsSync(srcPath) ? srcPath : repoPath;
    
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name.toLowerCase());
    const files = entries.filter(e => e.isFile()).map(e => e.name);

    for (const [patternKey, indicator] of Object.entries(PATTERN_INDICATORS)) {
      // Check for directory patterns
      if (indicator.dirs.some(d => dirs.includes(d.toLowerCase()))) {
        patterns.push(indicator.name);
        continue;
      }

      // Check for file patterns
      for (const filePattern of indicator.files) {
        const regex = new RegExp('^' + filePattern.replace('*', '.*') + '$');
        if (files.some(f => regex.test(f))) {
          patterns.push(indicator.name);
          break;
        }
      }
    }

    // Check for hooks directory specifically
    if (dirs.includes('hooks') || files.some(f => f.startsWith('use') && (f.endsWith('.ts') || f.endsWith('.tsx')))) {
      if (!patterns.includes('React Hooks')) {
        patterns.push('React Hooks');
      }
    }

    // Check for components directory (component-based architecture)
    if (dirs.includes('components')) {
      patterns.push('Component-Based');
    }

    // Check for API routes
    if (dirs.includes('api') || dirs.includes('routes')) {
      patterns.push('API Routes');
    }

  } catch (error) {
    logger.debug(`Pattern detection error: ${(error as Error).message}`);
  }

  return [...new Set(patterns)];
}

async function detectConventions(repoPath: string): Promise<ProjectContext['conventions']> {
  const conventions: ProjectContext['conventions'] = {};
  
  try {
    const srcPath = path.join(repoPath, 'src');
    const basePath = fs.existsSync(srcPath) ? srcPath : repoPath;
    
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    const files = entries.filter(e => e.isFile()).map(e => e.name);
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    // Detect file naming convention
    const camelCaseCount = files.filter(f => /^[a-z][a-zA-Z0-9]*\.[a-z]+$/.test(f)).length;
    const pascalCaseCount = files.filter(f => /^[A-Z][a-zA-Z0-9]*\.[a-z]+$/.test(f)).length;
    const snakeCaseCount = files.filter(f => /^[a-z][a-z0-9_]*\.[a-z]+$/.test(f)).length;
    const kebabCaseCount = files.filter(f => /^[a-z][a-z0-9-]*\.[a-z]+$/.test(f)).length;

    const maxCount = Math.max(camelCaseCount, pascalCaseCount, snakeCaseCount, kebabCaseCount);
    if (maxCount > 0) {
      if (pascalCaseCount === maxCount) conventions.naming = 'PascalCase';
      else if (camelCaseCount === maxCount) conventions.naming = 'camelCase';
      else if (snakeCaseCount === maxCount) conventions.naming = 'snake_case';
      else conventions.naming = 'mixed';
    }

    // Detect file structure
    const featureDirs = ['features', 'modules', 'domains'];
    const layerDirs = ['components', 'services', 'utils', 'hooks', 'models', 'controllers'];
    
    const hasFeatureDirs = featureDirs.some(d => dirs.includes(d));
    const hasLayerDirs = layerDirs.filter(d => dirs.includes(d)).length >= 2;

    if (hasFeatureDirs) {
      conventions.fileStructure = 'feature-based';
    } else if (hasLayerDirs) {
      conventions.fileStructure = 'layer-based';
    } else if (dirs.length <= 2) {
      conventions.fileStructure = 'flat';
    } else {
      conventions.fileStructure = 'mixed';
    }

  } catch (error) {
    logger.debug(`Convention detection error: ${(error as Error).message}`);
  }

  return conventions;
}

export function formatContextForPrompt(context: ProjectContext): string {
  const lines: string[] = [
    `Language: ${context.language}`,
  ];

  if (context.framework) {
    lines.push(`Framework: ${context.framework}`);
  }
  if (context.testFramework) {
    lines.push(`Test Framework: ${context.testFramework}`);
  }
  if (context.patterns.length > 0) {
    lines.push(`Patterns: ${context.patterns.join(', ')}`);
  }
  if (context.conventions.naming) {
    lines.push(`Naming Convention: ${context.conventions.naming}`);
  }
  if (context.conventions.fileStructure) {
    lines.push(`File Structure: ${context.conventions.fileStructure}`);
  }
  if (context.dependencies.length > 0) {
    lines.push(`Key Dependencies: ${context.dependencies.slice(0, 8).join(', ')}${context.dependencies.length > 8 ? '...' : ''}`);
  }

  return lines.join('\n');
}
