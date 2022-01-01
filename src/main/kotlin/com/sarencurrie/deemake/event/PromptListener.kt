package com.sarencurrie.deemake.event

import com.sarencurrie.deemake.db.Persistence
import com.sarencurrie.deemake.model.Prompt
import com.sarencurrie.deemake.model.Prompt.PromptType.DMC
import com.sarencurrie.deemake.model.Prompt.PromptType.SPD
import net.dv8tion.jda.api.entities.ChannelType.PRIVATE
import net.dv8tion.jda.api.events.message.MessageReceivedEvent
import net.dv8tion.jda.api.hooks.ListenerAdapter
import java.time.Instant

class PromptListener(val persistence: Persistence) : ListenerAdapter() {
    override fun onMessageReceived(event: MessageReceivedEvent) {
        if (event.channelType == PRIVATE) {
            if (event.author.mutualGuilds.size < 1) {
                event.channel.sendMessage("Oh no! It seems we don't share any servers.").submit().get()
            } else if (event.author.mutualGuilds.size > 1) {
                event.channel.sendMessage("Oh no! It seems we share too many servers.").submit().get()
            } else {
                val parts = Regex("^(\\S*)\\s*([\\s\\S]*)\$").matchEntire(event.message.contentRaw)
                if (parts == null || parts.groups.size != 2) {
                    event.channel.sendMessage("Oh no! I couldn't understand your request.").submit().get()
                    return
                }
                val guild = event.author.mutualGuilds[0]
                val type = when (parts.groups[0]!!.value.lowercase()) {
                    "d", "dmc" -> DMC
                    "s", "spd" -> SPD
                    "a", "answer" -> {
                        // Do anon mode
                        event.channel.sendMessage("Sorry! Anon mode doesn't work right now.").submit().get()
                        return
                    }
                    else -> {
                        event.channel.sendMessage("Oh no! I don't know how to do that.").submit().get()
                        return
                    }
                }
                persistence.save(Prompt(parts.groups[1]!!.value, Instant.now(), type, guild.id))
                event.channel.sendMessage("Ooh, that's a good $type! Thanks! <3").submit().get()
            }
        }
    }
}