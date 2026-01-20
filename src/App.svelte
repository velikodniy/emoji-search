<script lang="ts">
    import { onMount } from "svelte";
    import SearchBar from "./components/SearchBar.svelte";
    import EmojiList from "./components/EmojiList.svelte";
    import ThemeToggle from "./components/ThemeToggle.svelte";
    import { searchEmojis, type EmojiResult } from "./lib/emoji-db";
    import { preloadModel, onModelStatus } from "./lib/embeddings";

    let results: EmojiResult[] = $state([]);
    let isSearching = $state(false);
    let isModelLoading = $state(true);
    let isModelReady = $state(false);
    let error: string | null = $state(null);

    onMount(() => {
        // Start loading model immediately
        preloadModel();

        // Subscribe to model status
        return onModelStatus((status) => {
            isModelLoading = status.loading;
            isModelReady = status.ready;
        });
    });

    async function handleSearch(query: string) {
        if (!query.trim()) {
            results = [];
            return;
        }

        isSearching = true;
        error = null;

        try {
            const searchResults = await searchEmojis(query, 10);
            results = searchResults;
        } catch (err) {
            error = err instanceof Error ? err.message : "Search failed";
            results = [];
        } finally {
            isSearching = false;
        }
    }
</script>

<div class="container">
    <header>
        <h1>Emoji Search</h1>
        <ThemeToggle />
    </header>

    <main>
        <SearchBar onSearch={handleSearch} isLoading={isSearching} />

        {#if !isModelReady && isModelLoading}
            <p class="status">Loading AI model...</p>
        {:else if error}
            <p class="status error">{error}</p>
        {:else if results.length > 0}
            <EmojiList {results} />
        {:else if !isSearching}
            <p class="status hint">Type a description to search for emojis</p>
        {/if}
    </main>
</div>

<style>
    .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 2rem 1rem;
        min-height: 100vh;
    }

    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
    }

    h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
    }

    main {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .status {
        text-align: center;
        color: var(--text-secondary);
        padding: 2rem;
    }

    .status.error {
        color: var(--error);
    }

    .status.hint {
        opacity: 0.7;
    }
</style>
