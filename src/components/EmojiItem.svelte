<script lang="ts">
  import type { EmojiResult } from "../lib/emoji-db";

  interface Props {
    result: EmojiResult;
  }

  let { result }: Props = $props();
  let copied = $state(false);

  async function copyEmoji() {
    try {
      await navigator.clipboard.writeText(result.char);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1500);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = result.char;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1500);
    }
  }
</script>

<div class="emoji-item">
  <span class="emoji">{result.char}</span>

  <div class="info">
    <span class="name">{result.name}</span>
    <span class="code">{result.code}</span>
  </div>

  <button class="copy-btn" onclick={copyEmoji} title="Copy emoji">
    {#if copied}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    {/if}
  </button>
</div>

<style>
  .emoji-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--bg-card);
    border-radius: 10px;
    border: 1px solid var(--border);
  }

  .emoji {
    font-size: 2rem;
    line-height: 1;
    min-width: 2.5rem;
    text-align: center;
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .name {
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .code {
    font-size: 0.75rem;
    font-family: monospace;
    color: var(--text-secondary);
  }

  .copy-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: background-color 0.15s, color 0.15s;
  }

  .copy-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .copy-btn svg {
    width: 18px;
    height: 18px;
  }
</style>
