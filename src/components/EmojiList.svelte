<script lang="ts">
  import EmojiItem from "./EmojiItem.svelte";
  import type { EmojiResult } from "../lib/emoji-db";

  interface Props {
    results: EmojiResult[];
  }

  let { results }: Props = $props();
</script>

<ul class="emoji-list">
  {#each results as result (result.code)}
    <li>
      <EmojiItem {result} />
    </li>
  {/each}
</ul>

<style>
  .emoji-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  li {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
