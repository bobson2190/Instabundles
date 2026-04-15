import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { getChannel, upsertChannel, removeChannel } from "../../db/bundles.repo";

export const data = new SlashCommandBuilder()
  .setName("channel")
  .setDescription("Manage bundle notifications for this channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub => 
    sub.setName("subscribe")
       .setDescription("Subscribe to platforms (comma separated). Defaults to all.")
       .addStringOption(opt => 
         opt.setName("platform")
            .setDescription("The platforms to subscribe to (e.g. 'Humble Choice, Fanatical')")
            .setRequired(false)
       )
       .addChannelOption(opt => 
         opt.setName("channel")
            .setDescription("The channel to subscribe to. Defaults to current channel.")
            .setRequired(false)
       )
  )
  .addSubcommand(sub => 
    sub.setName("unsubscribe")
       .setDescription("Unsubscribe from platforms (e.g. 'Humble Choice, Fanatical'). Defaults to all.")
       .addStringOption(opt => 
         opt.setName("platform")
            .setDescription("The platforms to unsubscribe from")
            .setRequired(false)
       )
       .addChannelOption(opt => 
         opt.setName("channel")
            .setDescription("The channel to unsubscribe from. Defaults to current channel.")
            .setRequired(false)
       )
  )
  .addSubcommand(sub =>
    sub.setName("status")
       .setDescription("Show current subscriptions")
  );

const PLATFORM_MAP: Record<string, string> = {
  "humble bundle": "humble",
  "humble": "humble",
  "humble choice": "choice",
  "choice": "choice",
  "fanatical": "fanatical",
  "green man gaming": "gmg",
  "gmg": "gmg",
  "humble bundle books": "humblebooks",
  "humble books": "humblebooks",
  "humblebooks": "humblebooks"
};

const ALL_PLATFORMS = ["humble", "choice", "fanatical", "gmg", "humblebooks"];

export async function handleChannelCommand(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({ content: "This command can only be used in a server.", flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "You need Administrator permissions to use this command.", flags: [MessageFlags.Ephemeral] });
    return;
  }

  const channelOption = interaction.options.getChannel("channel");
  const channelId = channelOption?.id || interaction.channelId;

  const current = await getChannel(channelId) || { platforms: [] };
  let platforms = current.platforms || [];

  if (subcommand === "status") {
    const platformList = platforms.length > 0 ? platforms.join(", ") : "None";
    await interaction.reply({ content: `**Subscriptions:** ${platformList}`, flags: [MessageFlags.Ephemeral] });
    return;
  }

  const platformInput = interaction.options.getString("platform");
  let targetPlatforms: string[] = [];

  if (!platformInput) {
    targetPlatforms = ALL_PLATFORMS;
  } else {
    targetPlatforms = platformInput.split(',')
      .map(s => s.trim().toLowerCase())
      .map(s => PLATFORM_MAP[s] || s)
      .filter(s => ALL_PLATFORMS.includes(s));
    
    targetPlatforms = [...new Set(targetPlatforms)];

    if (targetPlatforms.length === 0) {
      await interaction.reply({ content: `Invalid platform(s). Valid options: ${ALL_PLATFORMS.join(", ")}`, flags: [MessageFlags.Ephemeral] });
      return;
    }
  }

  if (subcommand === "subscribe") {
    const added: string[] = [];
    for (const p of targetPlatforms) {
      if (!platforms.includes(p)) {
        platforms.push(p);
        added.push(p);
      }
    }

    if (added.length > 0) {
        await upsertChannel(channelId, guildId, platforms);
        await interaction.reply({ content: `Subscribed to: ${added.join(", ")}.`, flags: [MessageFlags.Ephemeral] });
    } else {
        await interaction.reply({ content: `Already subscribed to all specified platforms.`, flags: [MessageFlags.Ephemeral] });
    }
  } else if (subcommand === "unsubscribe") {
    const removed: string[] = [];
    for (const p of targetPlatforms) {
      if (platforms.includes(p)) {
        platforms = platforms.filter((existing: string) => existing !== p);
        removed.push(p);
      }
    }

    if (removed.length > 0) {
        if (platforms.length === 0) {
            await removeChannel(channelId);
        } else {
            await upsertChannel(channelId, guildId, platforms);
        }
        await interaction.reply({ content: `Unsubscribed from: ${removed.join(", ")}.`, flags: [MessageFlags.Ephemeral] });
    } else {
        await interaction.reply({ content: `Not subscribed to any of the specified platforms.`, flags: [MessageFlags.Ephemeral] });
    }
  }
}