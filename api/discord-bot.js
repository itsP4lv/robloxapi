require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require("discord.js");

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const apiBase = process.env.API_BASE_URL;
const adminKey = process.env.ADMIN_API_KEY;

if (!token || !appId || !guildId || !apiBase || !adminKey) {
    console.error(
        "Missing env vars. Required: DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, API_BASE_URL, ADMIN_API_KEY"
    );
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder()
        .setName("createkey")
        .setDescription("Create a new key from the API")
        .addStringOption((opt) =>
            opt.setName("userid").setDescription("Roblox user id").setRequired(true)
        )
        .addIntegerOption((opt) =>
            opt
                .setName("days")
                .setDescription("Duration in days (1..365)")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(365)
        )
].map((c) => c.toJSON());

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands });
}

async function createKey(userId, days) {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/create`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify({ userId, durationDays: days })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
        throw new Error(data.error || "Create request failed");
    }
    return data;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
    console.log(`Discord bot online as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "createkey") {
        return;
    }
    const userId = interaction.options.getString("userid", true);
    const days = interaction.options.getInteger("days") ?? 1;

    if (!/^[0-9]{1,20}$/.test(userId)) {
        await interaction.reply({ content: "Invalid user id format.", ephemeral: true });
        return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
        const result = await createKey(userId, days);
        await interaction.editReply(
            `Key created.\n- key: ${result.key}\n- expires: ${new Date(result.expires).toISOString()}`
        );
    } catch (err) {
        await interaction.editReply(`Failed to create key: ${err.message}`);
    }
});

registerCommands()
    .then(() => client.login(token))
    .catch((err) => {
        console.error("Failed to register commands:", err.message);
        process.exit(1);
    });
