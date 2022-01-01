package com.sarencurrie.deemake.db

import com.sarencurrie.deemake.model.Prompt
import org.assertj.core.api.Assertions
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.*

class SqlitePersistenceIT {
    @Test
    fun testSqlitePersistence() {
        val p = SqlLitePersistence()

        val guildId = UUID.randomUUID().toString()
        p.save(
            Prompt(
                "1",
                Instant.now(),
                Prompt.PromptType.DMC,
                guildId,
                false
            )
        )

        p.save(
            Prompt(
                "2",
                Instant.now(),
                Prompt.PromptType.DMC,
                guildId,
                false
            )
        )

        p.save(
            Prompt(
                "3",
                Instant.now(),
                Prompt.PromptType.DMC,
                guildId,
                false
            )
        )

        val q = p.getPrompt(guildId, Prompt.PromptType.DMC, true)
        Assertions.assertThat(q).isEqualTo("1")

        val q2 = p.getPrompt(guildId, Prompt.PromptType.DMC, true)
        Assertions.assertThat(q2).isEqualTo("2")
    }
}