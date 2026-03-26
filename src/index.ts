#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createGitService } from './services/git';
import { createReviewer } from './services/reviewer';
import { formatReviewOutput, formatError } from './services/formatter';
import { createExporter } from './services/exporter';
import { Config, DEFAULT_CONFIG, OutputOptions } from './types';
import { logger, LogLevel, setLogLevel } from './utils/logger';
import { loadProjectConfig, mergeConfig, saveDefaultConfig } from './utils/config-loader';

const program = new Command();

program
  .name('pr-review')
  .description('AI-powered local Git PR reviewer using Ollama')
  .version('1.0.0');

function buildConfig(options: Record<string, unknown>): Config {
  const projectConfig = loadProjectConfig();
  
  const outputFormat = options.json ? 'json' 
    : options.markdown ? 'markdown'
    : options.html ? 'html'
    : 'cli';

  const cliOptions: Partial<Config> = {
    ollamaUrl: options.url as string,
    model: options.model as string,
    baseBranch: options.base as string,
    maxChunkSize: options.chunkSize ? parseInt(options.chunkSize as string, 10) : undefined,
    output: {
      format: outputFormat,
      outputFile: options.output as string,
      groupBy: options.groupBy as 'file' | 'severity' | 'category',
    } as OutputOptions,
  };

  return mergeConfig(cliOptions, projectConfig);
}

program
  .option('-b, --base <branch>', 'Base branch to compare against', DEFAULT_CONFIG.baseBranch)
  .option('-t, --target <branch>', 'Target branch to review', 'HEAD')
  .option('-m, --model <model>', 'Ollama model to use', DEFAULT_CONFIG.model)
  .option('-u, --url <url>', 'Ollama API URL', DEFAULT_CONFIG.ollamaUrl)
  .option('-s, --staged', 'Review only staged changes', false)
  .option('-a, --all', 'Review all uncommitted changes', false)
  .option('--chunk-size <size>', 'Maximum chunk size for large diffs', String(DEFAULT_CONFIG.maxChunkSize))
  .option('-v, --verbose', 'Enable verbose logging', false)
  .option('--json', 'Output results as JSON', false)
  .option('--markdown', 'Output results as Markdown', false)
  .option('--html', 'Output results as HTML', false)
  .option('-o, --output <file>', 'Save report to file')
  .option('--group-by <type>', 'Group issues by: file, severity, category', 'file')
  .option('--fail-on-high', 'Exit with code 1 if high severity issues found', false)
  .option('--fail-on-critical', 'Exit with code 1 if critical severity issues found', false)
  .action(async (options) => {
    try {
      if (options.verbose) {
        setLogLevel(LogLevel.DEBUG);
      }

      const config = buildConfig(options);

      logger.debug('Configuration:', config);

      const git = createGitService();

      const isRepo = await git.isGitRepository();
      if (!isRepo) {
        console.error(chalk.red('Error: Not a git repository'));
        process.exit(1);
      }

      const reviewer = createReviewer(config);

      const prereq = await reviewer.checkPrerequisites();
      if (!prereq.ok) {
        console.error(chalk.red(`Error: ${prereq.message}`));
        process.exit(1);
      }

      let diff: string;

      if (options.staged) {
        logger.info('Reviewing staged changes...');
        diff = await git.getStagedDiff();
      } else if (options.all) {
        logger.info('Reviewing all uncommitted changes...');
        diff = await git.getAllChanges();
      } else {
        const currentBranch = await git.getCurrentBranch();
        logger.info(`Reviewing changes: ${options.base}...${options.target}`);
        logger.debug(`Current branch: ${currentBranch}`);
        diff = await git.getDiffBetweenBranches(options.base, options.target);
      }

      if (!diff || diff.trim().length === 0) {
        console.log(chalk.yellow('No changes found to review.'));
        process.exit(0);
      }

      const changedLines = diff.split('\n').length;
      logger.info(`Found ${changedLines} lines of diff to analyze`);

      const result = await reviewer.review(diff);

      if (config.output.format === 'cli') {
        console.log(formatReviewOutput(result));
      } else {
        const exporter = createExporter(config.output);
        const output = exporter.export(result);
        if (!config.output.outputFile) {
          console.log(output);
        }
      }

      if (options.failOnCritical && result.stats.critical > 0) {
        console.log(chalk.red(`\nExiting with code 1 due to ${result.stats.critical} critical severity issue(s)`));
        process.exit(1);
      }

      if (options.failOnHigh && (result.stats.high > 0 || result.stats.critical > 0)) {
        console.log(chalk.red(`\nExiting with code 1 due to ${result.stats.high + result.stats.critical} high/critical severity issue(s)`));
        process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error(formatError(error as Error));
      process.exit(1);
    }
  });

program
  .command('pr <branch>')
  .description('Review a PR branch against base branch (like reviewing a GitHub PR)')
  .option('-b, --base <branch>', 'Base branch to compare against', DEFAULT_CONFIG.baseBranch)
  .option('-r, --remote <remote>', 'Remote name', 'origin')
  .option('-f, --fetch', 'Fetch latest from remote before comparing', false)
  .option('--local', 'Use local branches only (no remote fetch)', false)
  .option('-m, --model <model>', 'Ollama model to use', DEFAULT_CONFIG.model)
  .option('-u, --url <url>', 'Ollama API URL', DEFAULT_CONFIG.ollamaUrl)
  .option('--chunk-size <size>', 'Maximum chunk size for large diffs', String(DEFAULT_CONFIG.maxChunkSize))
  .option('-v, --verbose', 'Enable verbose logging', false)
  .option('--json', 'Output results as JSON', false)
  .option('--markdown', 'Output results as Markdown', false)
  .option('--html', 'Output results as HTML', false)
  .option('-o, --output <file>', 'Save report to file')
  .option('--fail-on-high', 'Exit with code 1 if high severity issues found', false)
  .option('--fail-on-critical', 'Exit with code 1 if critical severity issues found', false)
  .action(async (branch: string, options) => {
    try {
      if (options.verbose) {
        setLogLevel(LogLevel.DEBUG);
      }

      const config = buildConfig(options);

      const git = createGitService();

      const isRepo = await git.isGitRepository();
      if (!isRepo) {
        console.error(chalk.red('Error: Not a git repository'));
        process.exit(1);
      }

      const reviewer = createReviewer(config);

      const prereq = await reviewer.checkPrerequisites();
      if (!prereq.ok) {
        console.error(chalk.red(`Error: ${prereq.message}`));
        process.exit(1);
      }

      console.log(chalk.cyan(`\n🔍 Reviewing PR: ${branch} → ${options.base}\n`));

      const shouldFetch = options.fetch && !options.local;
      
      const { diff, baseRef, prRef } = await git.getDiffForPR(
        options.base,
        branch,
        { fetch: shouldFetch, remote: options.remote }
      );

      const commitCount = await git.getCommitCount(baseRef, prRef);
      logger.info(`Comparing: ${prRef} → ${baseRef}`);
      logger.info(`Commits in PR: ${commitCount}`);

      if (!diff || diff.trim().length === 0) {
        console.log(chalk.yellow('No changes found between branches.'));
        console.log(chalk.gray(`  Base: ${baseRef}`));
        console.log(chalk.gray(`  PR:   ${prRef}`));
        process.exit(0);
      }

      const changedLines = diff.split('\n').length;
      logger.info(`Found ${changedLines} lines of diff to analyze`);

      const result = await reviewer.review(diff);

      console.log(chalk.gray(`  Base: ${baseRef}`));
      console.log(chalk.gray(`  PR:   ${prRef}`));
      console.log(chalk.gray(`  Commits: ${commitCount}`));

      if (config.output.format === 'cli') {
        console.log(formatReviewOutput(result));
      } else {
        const exporter = createExporter(config.output);
        const output = exporter.export(result);
        if (!config.output.outputFile) {
          console.log(output);
        }
      }

      if (options.failOnCritical && result.stats.critical > 0) {
        console.log(chalk.red(`\nExiting with code 1 due to ${result.stats.critical} critical severity issue(s)`));
        process.exit(1);
      }

      if (options.failOnHigh && (result.stats.high > 0 || result.stats.critical > 0)) {
        console.log(chalk.red(`\nExiting with code 1 due to ${result.stats.high + result.stats.critical} high/critical severity issue(s)`));
        process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error(formatError(error as Error));
      process.exit(1);
    }
  });

program
  .command('check')
  .description('Check if Ollama is running and model is available')
  .option('-m, --model <model>', 'Ollama model to check', DEFAULT_CONFIG.model)
  .option('-u, --url <url>', 'Ollama API URL', DEFAULT_CONFIG.ollamaUrl)
  .action(async (options) => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      ollamaUrl: options.url,
      model: options.model,
    };

    const reviewer = createReviewer(config);
    const prereq = await reviewer.checkPrerequisites();

    if (prereq.ok) {
      console.log(chalk.green('✓ Ollama is running'));
      console.log(chalk.green(`✓ Model "${options.model}" is available`));
      process.exit(0);
    } else {
      console.error(chalk.red(`✗ ${prereq.message}`));
      process.exit(1);
    }
  });

program
  .command('branches')
  .description('List available branches (local and remote)')
  .option('-f, --fetch', 'Fetch latest from remote first', false)
  .action(async (options) => {
    try {
      const git = createGitService();

      const isRepo = await git.isGitRepository();
      if (!isRepo) {
        console.error(chalk.red('Error: Not a git repository'));
        process.exit(1);
      }

      if (options.fetch) {
        console.log(chalk.gray('Fetching from remotes...'));
        await git.fetchAll();
      }

      const currentBranch = await git.getCurrentBranch();
      const localBranches = await git.getLocalBranches();
      const remoteBranches = await git.getRemoteBranches();

      console.log(chalk.bold('\nLocal Branches:'));
      for (const branch of localBranches) {
        const marker = branch === currentBranch ? chalk.green('* ') : '  ';
        console.log(`${marker}${branch}`);
      }

      console.log(chalk.bold('\nRemote Branches:'));
      for (const branch of remoteBranches) {
        console.log(`  ${branch}`);
      }
      console.log('');

      process.exit(0);
    } catch (error) {
      console.error(formatError(error as Error));
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize a .pr-reviewrc.json configuration file')
  .action(() => {
    try {
      const configPath = saveDefaultConfig();
      console.log(chalk.green(`✓ Created configuration file: ${configPath}`));
      console.log(chalk.gray('\nEdit this file to customize your review settings.'));
      process.exit(0);
    } catch (error) {
      console.error(formatError(error as Error));
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    try {
      const projectConfig = loadProjectConfig();
      const config = mergeConfig({}, projectConfig);
      
      console.log(chalk.bold('\nCurrent Configuration:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(JSON.stringify(config, null, 2));
      
      if (projectConfig) {
        console.log(chalk.green('\n✓ Using project config file'));
      } else {
        console.log(chalk.yellow('\n⚠ No project config found, using defaults'));
        console.log(chalk.gray('  Run `pr-review init` to create a config file'));
      }
      
      process.exit(0);
    } catch (error) {
      console.error(formatError(error as Error));
      process.exit(1);
    }
  });

program.parse();
