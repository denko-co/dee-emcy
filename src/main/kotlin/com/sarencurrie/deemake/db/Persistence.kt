package com.sarencurrie.deemake.db

import com.sarencurrie.deemake.model.Prompt

interface Persistence : AutoCloseable {
    fun save(prompt: Prompt)

    fun getPrompt(guildId: String, type: Prompt.PromptType, setUse: Boolean = true): String?
}