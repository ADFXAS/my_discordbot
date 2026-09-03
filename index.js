require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { YouTubePlugin } = require('@distube/youtube');
const ffmpeg = require('ffmpeg-static');
if (!process.env.DISCORD_TOKEN) {
  throw new Error('ضع DISCORD_TOKEN داخل ملف .env');
}
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});
const distube = new DisTube(client, {
  ffmpeg: {
    path: ffmpeg,
  },
  plugins: [new YtDlpPlugin()]
});
// قائمة المعرفات المسموح لها باستخدام أوامر النوباك
const ALLOWED_USERS = [
  'حط ال id ',
];
// قائمة حظر النوباك (في الذاكرة)
const noBackList = new Set();
// حالة نظام الحماية تلقائياً عند فك الباند
let isNoBackEnabled = true;
client.once('clientReady', () => {
  console.log(`✅ تم تشغيل البوت بنجاح باسم: ${client.user.tag}`);
});
// 1. التعامل مع الأوامر الكتابية
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  // التحقق من صلاحية المستخدم لأوامر النوباك
  const isAllowed = ALLOWED_USERS.includes(message.author.id) ||
                    message.member.permissions.has(PermissionsBitField.Flags.Administrator);
  // ==========================================
  // أوامر نظام النوباك
  // ==========================================
  // أمر إضافة شخص إلى قائمة النوباك وتطبيق الباند فوراً
  if (message.content.startsWith('!noback add')) {
    if (!isAllowed) return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    const args = message.content.split(' ');
    const userId = args[2];
    if (!userId || isNaN(userId)) {
      return message.reply(':warning: يرجى كتابة الـ ID الصحيح للطرف المستهدف.');
    }
    noBackList.add(userId);
    try {
      await message.guild.members.ban(userId, {
        reason: 'نظام حماية النوباك (No-Back)'
      });
      return message.reply(`✅  <@${userId}> تم شقه بنجاح.`);
    } catch (error) {
      console.error(error);
      return message.reply(
        `✅ تم إضافة <@${userId}> للقائمة، لكن تعذر تبنيده فوراً (تأكد من وجود البوت فوق رتبته أو تمتعه بصلاحية Ban Members).`
      );
    }
  }
  // أمر إزالة شخص من القائمة لفك الباند عنه
  if (message.content.startsWith('!noback remove')) {
    if (!isAllowed) return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    const args = message.content.split(' ');
    const userId = args[2];
    if (!userId || isNaN(userId)) {
      return message.reply(':warning: يرجى كتابة الـ ID الصحيح.');
    }
    if (noBackList.has(userId)) {
      noBackList.delete(userId);
      return message.reply(`✅ تم إزالة <@${userId}> انفك النوباك .`);
    } else {
      return message.reply(':warning: غلطان يالاخو.');
    }
  }
  // أمر عرض القائمة الحالية
  if (message.content === '!noback list') {
    if (!isAllowed) return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    if (noBackList.size === 0) {
      return message.reply(':clipboard: قائمة النوباك فارغة حالياً.');
    }
    const list = Array.from(noBackList)
      .map(id => `- <@${id}> (${id})`)
      .join('\n');
    return message.reply(
      `📋 **قائمة المحظورين نوباك (${noBackList.size}):**\n${list}`
    );
  }
  // أمر تفعيل/تعطيل نظام الحماية التلقائي
  if (message.content.startsWith('!noback_protection')) {
    if (!isAllowed) return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    const args = message.content.split(' ');
    const status = args[1];
    if (status === 'on') {
      isNoBackEnabled = true;
      return message.reply(':green_circle: تم دخول النظام .');
    } else if (status === 'off') {
      isNoBackEnabled = false;
      return message.reply(':red_circle: توقف النظام.');
    } else {
      return message.reply(
        `⚠️ الحالة الحالية للنظام: **${isNoBackEnabled ? 'مفعل 🟢' : 'معطل 🔴'}**\nاستخدم \`!noback_protection on\` أو \`off\`.`
      );
    }
  }
  // ==========================================
  // أوامر الأغاني والموسيقى
  // ==========================================
  const args = message.content.trim().split(/ +/);
  const command = args.shift().toLowerCase();
  // أمر التشغيل: !play أو !p
  if (command === '!play' || command === '!p') {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply(':x: يجب أن تكون في روم صوتية أولاً!');
    }
    const query = args.join(' ');
    if (!query) {
      return message.reply(':x: يرجى كتابة اسم الأغنية أو الرابط!');
    }
    try {
      await distube.play(voiceChannel, query, {
        textChannel: message.channel,
        member: message.member
      });
    } catch (error) {
      console.error('[DisTube Error]:', error);
      return message.reply(
        `❌ تعذر التشغيل: ${error.message || 'حدث خطأ أثناء جلب المقطع'}`
      );
    }
  }
// أمر الإيقاف وخروج البوت: !stop
if (command === '!stop') {
  try {
    await distube.stop(message.guild);
  } catch (e) {
    // لا توجد أغنية، نكمل لإخراج البوت
  }

  const voice = distube.voices.get(message.guild.id);

  if (voice) {
    voice.leave();
  }

  const botVoice = message.guild.members.me?.voice;

  if (botVoice?.channel) {
    await botVoice.disconnect();
  }

  return message.reply('🛑 تم إيقاف التشغيل وإخراج البوت.');
}
  // أمر تخطي الأغنية: !skip
  if (command === '!skip') {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply('❌ يجب أن تكون في روم صوتية لتخطي الأغنية!');
    }
    try {
      await distube.skip(message.guild);
      return message.reply('⏭️ تم تخطي الأغنية.');
    } catch (e) {
      return message.reply('❌ لا يوجد مقطع تالي لتخطيه.');
    }
  }
});
// أحداث مشغل الموسيقى DisTube
distube.on('playSong', (queue, song) => {
  queue.textChannel.send(
    `🎶 جاري تشغيل: **${song.name}**`
  );
});

distube.on('error', (channel, error) => {
  console.error('[DisTube Event Error]:', error);
  if (channel) {
    channel.send(`❌ خطأ في المشغل: ${error.message}`);
  }
});
// حدث حماية النوباك عند فك الباند
client.on('guildBanRemove', async (ban) => {
  if (!isNoBackEnabled) return;
  const userId = ban.user.id;
  if (noBackList.has(userId)) {
    await ban.guild.members.ban(userId, {
      reason: 'إعادة حظر تلقائي - نظام النوباك'
    });
    console.log(
      `[No-Back] تم إعادة حظر المستهدف تلقائياً: ${ban.user.tag}`
    );
  }
});
client.login(process.env.DISCORD_TOKEN);

