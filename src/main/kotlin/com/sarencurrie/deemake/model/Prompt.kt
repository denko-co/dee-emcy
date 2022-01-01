package com.sarencurrie.deemake.model

import java.time.Instant

data class Prompt(
    val question: String,
    val submitted: Instant,
    val type: PromptType,
    val guildId: String,
    val used: Boolean = false
) {
    enum class PromptType {
        DMC, SPD
    }
}

