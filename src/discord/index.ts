import { Client, GatewayIntentBits, Interaction } from 'discord.js';
import { handleBundleCommand } from './commands/bundle';
import { handleChannelCommand } from './commands/channel';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages, // Needed to see messages
  ]
});

client.once('ready', () => {
  console.log(`[Discord] Logged in as ${client.user?.tag}`);
});

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    if (commandName === 'bundle') {
      await handleBundleCommand(interaction);
    } 
    else if (commandName === 'channel') {
      await handleChannelCommand(interaction); // Your admin channel management
    }
  } catch (error) {
    console.error('[Discord] Interaction Error:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Command failed.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Command failed.', ephemeral: true });
    }
  }
});

export async function startDiscordBot() {
  if (!process.env.DISCORD_BOT_TOKEN) {
    throw new Error("Missing DISCORD_BOT_TOKEN");
  }
  await client.login(process.env.DISCORD_BOT_TOKEN);
}