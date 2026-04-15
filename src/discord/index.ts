import { Client, GatewayIntentBits, Interaction, MessageFlags } from 'discord.js';
import { handleBundleCommand } from './commands/bundle';
import { handleChannelCommand } from './commands/channel';
import { handleRemindersCommand } from './commands/reminders';
import { handleAdminCommand } from './commands/admin';

const isTestMode = process.argv.includes('--test');

let killSwitch = false;

export function isKillSwitchActive() {
  return killSwitch;
}

export function setKillSwitch(active: boolean) {
  killSwitch = active;
}

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages, // Needed to see messages
  ]
});

client.once('clientReady', () => {
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
      await handleChannelCommand(interaction);
    }
    else if (commandName === 'reminders') {
      await handleRemindersCommand(interaction);
    }
    else if (commandName === 'admin') {
      await handleAdminCommand(interaction);
    }
  } catch (error) {
    console.error('[Discord] Interaction Error:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Command failed.', flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: 'Command failed.', flags: MessageFlags.Ephemeral });
    }
  }
});

export async function startDiscordBot() {
  if (!process.env.DISCORD_BOT_TOKEN) {
    throw new Error("Missing DISCORD_BOT_TOKEN");
  } else if (isTestMode && !process.env.TEST_DISCORD_BOT_TOKEN) { throw new Error("Missing TEST_DISCORD_BOT_TOKEN and test is true")}
  let token = process.env.DISCORD_BOT_TOKEN;
  if (isTestMode && process.env.TEST_DISCORD_BOT_TOKEN) { token = process.env.TEST_DISCORD_BOT_TOKEN; }
  await client.login(token);
}