package com.sarencurrie.deemake.db

import com.sarencurrie.deemake.model.Prompt
import java.sql.Connection
import java.sql.DriverManager
import java.util.*

class SqlLitePersistence : Persistence {
    private val connection: Connection = DriverManager.getConnection("jdbc:sqlite:dee-emcy.sqlite")

    init {
        connection.createStatement()
            .executeUpdate("CREATE TABLE IF NOT EXISTS Prompts (id TEXT PRIMARY KEY, question TEXT, submitted INT, type INT, guildId TEXT, used BOOLEAN)")
    }

    override fun save(prompt: Prompt) {
        val statement = connection.prepareStatement("INSERT INTO Prompts VALUES (?, ?, ?, ?, ?, ?)")
        statement.setString(1, UUID.randomUUID().toString())
        statement.setString(2, prompt.question)
        statement.setLong(3, prompt.submitted.toEpochMilli())
        statement.setInt(4, prompt.type.ordinal)
        statement.setString(5, prompt.guildId)
        statement.setBoolean(6, prompt.used)
        statement.executeUpdate()
    }

    override fun getPrompt(guildId: String, type: Prompt.PromptType, setUse: Boolean): String? {
        // TODO guild ID
        val statement =
            connection.prepareStatement("SELECT id, question FROM Prompts WHERE guildId = ? AND type = ? AND used = FALSE ORDER BY submitted ASC LIMIT 1")
        statement.setString(1, guildId)
        statement.setInt(2, type.ordinal)
        val result = statement.executeQuery()
        if (!result.next()) {
            return null
        }
        val id = result.getString(1)
        val question = result.getString(2)
        if (setUse) {
            val update = connection.prepareStatement("UPDATE Prompts SET used = TRUE WHERE id = ?")
            update.setString(1, id)
            update.executeUpdate()
        }
        return question
    }

    override fun close() {
        connection.close()
    }
}