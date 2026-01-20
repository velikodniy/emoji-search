<script lang="ts">
    import { onMount } from "svelte";

    interface Props {
        onSearch: (query: string) => void;
        isLoading?: boolean;
        debounceMs?: number;
    }

    let { onSearch, isLoading = false, debounceMs = 300 }: Props = $props();

    let query = $state("");
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let inputEl: HTMLInputElement | null = null;

    onMount(() => {
        inputEl?.focus();
    });

    function handleInput(event: Event) {
        const target = event.target as HTMLInputElement;
        query = target.value;

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            onSearch(query);
        }, debounceMs);
    }
</script>

<div class="search-bar">
    <input
        type="text"
        placeholder="Describe an emoji..."
        value={query}
        oninput={handleInput}
        bind:this={inputEl}
        aria-busy={isLoading}
    />
    {#if isLoading}
        <span class="spinner"></span>
    {/if}
</div>

<style>
    .search-bar {
        position: relative;
        width: 100%;
    }

    input {
        width: 100%;
        padding: 1rem 1.25rem;
        font-size: 1.125rem;
        border: 2px solid var(--border);
        border-radius: 12px;
        background: var(--bg-input);
        color: var(--text-primary);
        outline: none;
        transition:
            border-color 0.2s,
            box-shadow 0.2s;
    }

    input::placeholder {
        color: var(--text-secondary);
        opacity: 0.7;
    }

    input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-shadow);
    }

    input:disabled {
        opacity: 0.7;
    }

    .spinner {
        position: absolute;
        right: 1rem;
        top: 50%;
        transform: translateY(-50%);
        width: 20px;
        height: 20px;
        border: 2px solid var(--border);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: translateY(-50%) rotate(360deg);
        }
    }
</style>
