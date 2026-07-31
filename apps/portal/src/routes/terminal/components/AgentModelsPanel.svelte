<script lang="ts">
  import {
    createLlmProfile,
    deleteLlmProfile,
    fetchLlmProfiles,
    type LlmCatalogProvider,
    type LlmProfilePublic,
    type LlmProviderId,
    updateLlmProfile,
  } from "$lib/agent/llm-profiles-api";
  import {
    llmProfileSelection,
    PLATFORM_LLM_PROFILE,
    setLlmProfileId,
  } from "$lib/agent/llm-profile-selection";
  import { privyAuth } from "$lib/privy-auth";

  let {
    onRequestAuth,
  }: {
    onRequestAuth: () => void;
  } = $props();

  let open = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let catalog = $state<LlmCatalogProvider[]>([]);
  let profiles = $state<LlmProfilePublic[]>([]);
  let storeConfigured = $state(true);
  let platformLabel = $state("Harness default (DeepSeek V4 Pro)");
  let busyId = $state<string | null>(null);

  let name = $state("My model");
  let provider = $state<LlmProviderId>("openai");
  let model = $state("gpt-5.4-mini");
  let apiKey = $state("");

  const modelsForProvider = $derived(
    catalog.find((entry) => entry.id === provider)?.models ?? [],
  );
  const hasServerActive = $derived(profiles.some((profile) => profile.active));
  const selection = $derived($llmProfileSelection.profileId);
  const platformSelected = $derived(
    selection === PLATFORM_LLM_PROFILE ||
      (selection === null && !hasServerActive),
  );

  async function refresh(): Promise<void> {
    if (!$privyAuth.authenticated) return;
    loading = true;
    error = null;
    try {
      const data = await fetchLlmProfiles();
      catalog = data.catalog;
      profiles = data.profiles;
      storeConfigured = data.storeConfigured;
      platformLabel = data.platformDefault.label;
      if (
        catalog.length > 0 &&
        !catalog.some((entry) => entry.id === provider)
      ) {
        provider = catalog[0].id;
      }
      const options = catalog.find((entry) => entry.id === provider)?.models;
      if (options && options.length > 0 && !options.some((m) => m.id === model)) {
        model = options[0].id;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "llm-load-failed";
    } finally {
      loading = false;
    }
  }

  async function toggleOpen(): Promise<void> {
    if (!$privyAuth.authenticated) {
      onRequestAuth();
      return;
    }
    open = !open;
    if (open) await refresh();
  }

  function onProviderChange(): void {
    const first = catalog.find((entry) => entry.id === provider)?.models[0];
    if (first) model = first.id;
  }

  async function onCreate(): Promise<void> {
    busyId = "__create__";
    error = null;
    try {
      const profile = await createLlmProfile({
        name,
        provider,
        model,
        apiKey,
        active: true,
      });
      setLlmProfileId(profile.id);
      apiKey = "";
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : "llm-create-failed";
    } finally {
      busyId = null;
    }
  }

  async function onActivate(profile: LlmProfilePublic): Promise<void> {
    busyId = profile.id;
    error = null;
    try {
      await updateLlmProfile(profile.id, { active: true });
      setLlmProfileId(profile.id);
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : "llm-activate-failed";
    } finally {
      busyId = null;
    }
  }

  async function onDelete(profile: LlmProfilePublic): Promise<void> {
    busyId = profile.id;
    error = null;
    try {
      await deleteLlmProfile(profile.id);
      if ($llmProfileSelection.profileId === profile.id) {
        setLlmProfileId(PLATFORM_LLM_PROFILE);
      }
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : "llm-delete-failed";
    } finally {
      busyId = null;
    }
  }

  function usePlatformDefault(): void {
    setLlmProfileId(PLATFORM_LLM_PROFILE);
  }
</script>

<div class="models">
  <button
    class="ghost"
    class:active={open}
    type="button"
    title="Bring your own model + API key"
    onclick={() => void toggleOpen()}
  >
    Models
  </button>

  {#if open}
    <section class="panel" aria-label="Agent models">
      <header>
        <h3>Models</h3>
        <p>
          Bring your own provider API key for this agent. Keys are stored
          server-side in your private vault and never shown to the model or
          returned to the browser.
        </p>
      </header>

      {#if loading}
        <p class="state">Loading models…</p>
      {:else if error}
        <p class="state error">{error}</p>
      {/if}

      {#if !storeConfigured}
        <p class="state">
          Model vault needs <code>BLOB_READ_WRITE_TOKEN</code>. Until then the
          platform default stays in use.
        </p>
      {/if}

      <div class="group">
        <h4>Active for this agent</h4>
        <button
          class="choice"
          class:selected={platformSelected}
          type="button"
          onclick={usePlatformDefault}
        >
          <strong>{platformLabel}</strong>
          <span class="meta">Platform key · no BYOK</span>
        </button>
        {#each profiles as profile (profile.id)}
          <div class="row">
            <button
              class="choice"
              class:selected={selection === profile.id ||
                (selection === null && profile.active)}
              type="button"
              disabled={busyId === profile.id}
              onclick={() => void onActivate(profile)}
            >
              <strong>{profile.name}</strong>
              <span class="meta">
                {profile.provider}/{profile.model} · …{profile.apiKeyLast4}
                {#if profile.active}
                  · server-active
                {/if}
              </span>
            </button>
            <button
              class="ghost danger"
              type="button"
              disabled={busyId === profile.id}
              onclick={() => void onDelete(profile)}
            >
              Delete
            </button>
          </div>
        {/each}
      </div>

      <div class="install">
        <h4>Add model profile</h4>
        <label>
          Name
          <input bind:value={name} maxlength="48" />
        </label>
        <label>
          Provider
          <select
            bind:value={provider}
            onchange={onProviderChange}
          >
            {#each catalog as entry (entry.id)}
              <option value={entry.id}>{entry.label}</option>
            {/each}
          </select>
        </label>
        <label>
          Model
          <select bind:value={model}>
            {#each modelsForProvider as entry (entry.id)}
              <option value={entry.id}>{entry.label}</option>
            {/each}
          </select>
        </label>
        <label>
          API key
          <input
            bind:value={apiKey}
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder={catalog.find((e) => e.id === provider)?.keyHint ??
              "Provider API key"}
          />
        </label>
        <button
          class="primary"
          type="button"
          disabled={busyId === "__create__" || !storeConfigured || !apiKey.trim()}
          onclick={() => void onCreate()}
        >
          Save & use
        </button>
      </div>
    </section>
  {/if}
</div>

<style>
  .models {
    position: relative;
  }

  button.ghost {
    background: transparent;
    border: 1px solid var(--line);
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    padding: 4px 8px;
    cursor: pointer;
  }

  button.ghost.active {
    border-color: var(--accent);
    color: var(--accent);
  }

  button.primary {
    background: var(--accent);
    border: 0;
    color: var(--bg);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    padding: 8px 12px;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 40;
    width: min(440px, 92vw);
    max-height: min(70vh, 680px);
    overflow: auto;
    background: var(--panel, #0f1115);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-hard-sm, 3px 3px 0 #000);
    padding: 12px;
    display: grid;
    gap: 12px;
  }

  header h3,
  .group h4,
  .install h4 {
    margin: 0 0 4px;
    font-size: 13px;
  }

  header p,
  .state,
  .meta {
    margin: 0;
    color: var(--muted, #9aa3b2);
    font-size: 12px;
    line-height: 1.4;
  }

  .state.error {
    color: var(--danger, #ff5c7a);
  }

  .choice {
    width: 100%;
    text-align: left;
    background: transparent;
    border: 1px solid var(--line);
    color: var(--ink);
    padding: 8px;
    cursor: pointer;
    display: grid;
    gap: 2px;
  }

  .choice.selected {
    border-color: var(--accent);
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    align-items: stretch;
  }

  button.danger {
    color: var(--danger, #ff5c7a);
  }

  .install {
    display: grid;
    gap: 8px;
  }

  label {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--muted, #9aa3b2);
  }

  input,
  select {
    background: var(--bg, #0a0b0e);
    color: var(--ink);
    border: 1px solid var(--line);
    font: inherit;
    font-size: 12px;
    padding: 8px;
  }

  code {
    font-size: 11px;
  }

  .group {
    display: grid;
    gap: 8px;
  }
</style>
