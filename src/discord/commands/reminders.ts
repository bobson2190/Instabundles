import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { upsertReminderConfig } from "../../db/bundles.repo";

export const data = new SlashCommandBuilder()
  .setName("reminders")
  .setDescription("Configure bundle expiration reminders")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub => 
    sub.setName("set")
       .setDescription("Set reminder configuration")
       .addRoleOption(opt => opt.setName("role").setDescription("Role to ping").setRequired(false))
       .addChannelOption(opt => opt.setName("channel").setDescription("Additional channel for notifications").setRequired(false))
  );

export async function handleRemindersCommand(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "This command can only be used in a server.", flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "You need Administrator permissions to use this command.", flags: [MessageFlags.Ephemeral] });
    return;
  }

  const role = interaction.options.getRole("role");
  const channel = interaction.options.getChannel("channel");

  await upsertReminderConfig(guildId, role?.id, channel?.id);
  
  await interaction.reply({ content: "Reminder configuration saved.", flags: [MessageFlags.Ephemeral] });
}
