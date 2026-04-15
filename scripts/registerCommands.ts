import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { data as bundleCommand } from '../src/discord/commands/bundle';
import { data as channelCommand } from '../src/discord/commands/channel';
import { data as remindersCommand } from '../src/discord/commands/reminders';
import { data as adminCommand } from '../src/discord/commands/admin';

let botToken = process.env.DISCORD_BOT_TOKEN;
let appID = process.env.APPLICATION_ID;
const isTest = process.argv.includes('--test');
if (isTest) {botToken = process.env.TEST_DISCORD_BOT_TOKEN; appID = process.env.TEST_APPLICATION_ID;}

export async function registerCommands() {
  if (!botToken || !appID) {
    console.error("Error: Missing DISCORD_BOT_TOKEN or APPLICATION_ID in .env");
    return;
  }

  const commands = [
    bundleCommand.toJSON(),
    channelCommand.toJSON(),
    remindersCommand.toJSON(),
    adminCommand.toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(botToken);

  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    await rest.put(
      Routes.applicationCommands(appID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

// Allow running directly via: npx ts-node src/discord/register-commands.ts
if (require.main === module) {
  registerCommands();
}