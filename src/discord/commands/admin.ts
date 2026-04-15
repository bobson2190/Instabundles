import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { setKillSwitch, isKillSwitchActive } from "../index";

export const data = new SlashCommandBuilder()
  .setName("admin")
  .setDescription("Administrative controls")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub => 
    sub.setName("stop")
       .setDescription("Stops all bot notifications immediately")
  )
  .addSubcommand(sub => 
    sub.setName("resume")
       .setDescription("Resumes bot notifications")
  )
  .addSubcommand(sub =>
    sub.setName("status")
       .setDescription("Check if the bot is currently paused")
  );

export async function handleAdminCommand(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "stop") {
    setKillSwitch(true);
    console.log(`[Admin] Kill switch activated by ${interaction.user.tag}`);
    await interaction.reply({ content: "**EMERGENCY STOP ACTIVATED.**\nThe bot will not post any new bundles until you run `/admin resume`." });
  } 
  else if (subcommand === "resume") {
    setKillSwitch(false);
    console.log(`[Admin] Kill switch deactivated by ${interaction.user.tag}`);
    await interaction.reply({ content: "**Bot Resumed,** all notifications will continue normally." });
  }
  else if (subcommand === "status") {
    const status = isKillSwitchActive() ? "**STOPPED**" : "**RUNNING**";
    await interaction.reply({ content: `Current Bot Status: ${status}`, flags: [MessageFlags.Ephemeral] });
  }
}