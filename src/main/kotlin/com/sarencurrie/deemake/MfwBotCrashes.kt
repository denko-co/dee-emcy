package com.sarencurrie.deemake

import com.sarencurrie.deemake.db.SqlLitePersistence
import com.sarencurrie.deemake.event.PromptListener
import net.dv8tion.jda.api.JDABuilder
import net.dv8tion.jda.api.entities.Activity
import net.dv8tion.jda.api.requests.GatewayIntent


fun main() {
    JDABuilder.createLight(System.getenv("DEE_TOKEN"), GatewayIntent.GUILD_MESSAGES, GatewayIntent.DIRECT_MESSAGES)
        .addEventListeners(PromptListener(SqlLitePersistence()))
        .setActivity(Activity.playing("DMC"))
        .build()
}