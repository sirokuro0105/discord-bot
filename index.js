require('dotenv').config();
const fs = require('fs');
const dayjs = require('dayjs');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let deadlines = [];
try {
    deadlines = JSON.parse(fs.readFileSync('deadlines.json', 'utf-8'));
} catch {
    deadlines = [];
}

client.once('ready', () => {
    console.log(`ログイン成功: ${client.user.tag}`);
});

// コマンド処理
client.on('messageCreate', message => {
    if (message.author.bot) return;

    const content = message.content.trim();

    // あいさつ
    if (content === 'スケジュール君、こんにちは') {
        message.channel.send('こんにちは！しっかりとスケジュール管理するで！！');
        return;
    }

    // 締切追加
    if (content.startsWith('!課題追加')) {
        const match = content.match(/^!課題追加\s+([^\s]+)\s+(.+?)(?:\s+<#(\d+)>)?$/);
        if (!match) {
            message.channel.send('形式がちゃうわ。「!課題追加 YYYY-MM-DDTHH:mm 課題名 #チャンネル」形式で入力してな！');
            return;
        }

        const [, dateStr, name, channelMentionId] = match;
        const date = dayjs(dateStr, 'YYYY-MM-DDTHH:mm', true);

        if (!date.isValid()) {
            message.channel.send('日付の形式がちゃうわ。「YYYY-MM-DDTHH:mm」形式で入力してくれへん？');
            return;
        }

        if (date.isBefore(dayjs())) {
            message.channel.send('過去の日時は登録できへんで！もう終わった話や！');
            return;
        }

        const channelId = channelMentionId || message.channel.id;

        deadlines.push({ date: dateStr, name, channelId });
        try {
            fs.writeFileSync('deadlines.json', JSON.stringify(deadlines, null, 2));
            message.channel.send(`${name} を ${dateStr} に登録したで。リマインドは <#${channelId}> に送るわ`);
        } catch (err) {
            message.channel.send('ファイルの保存に失敗してもうた、。');
        }

        return;
    }

    // 締切一覧表示
    if (content === '!課題一覧') {
        if (deadlines.length === 0) {
            message.channel.send('今のところ登録されている課題はないで。');
            return;
        }

        const list = deadlines.map(({ date, name }, i) => `${i + 1}. ${name} - 締切: ${date}`).join('\n');
        message.channel.send(`今登録されている課題一覧やで：\n${list}`);
        return;
    }

    // 締切削除
    if (content.startsWith('!課題削除')) {
        const parts = content.split(' ');
        if (parts.length !== 2 || isNaN(parts[1])) {
            message.channel.send('それ使い方ちゃうで！例: !課題削除 2');
            return;
        }

        const index = parseInt(parts[1], 10) - 1;
        if (index < 0 || index >= deadlines.length) {
            message.channel.send('そんな番号あれへんで！');
            return;
        }

        const removed = deadlines.splice(index, 1)[0];
        fs.writeFileSync('deadlines.json', JSON.stringify(deadlines, null, 2));
        message.channel.send(`${removed.name} の登録消しといたで`);
        return;
    }
});

// 通知用関数
async function sendReminder(text, channelId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            console.warn(`チャンネル ${channelId} が見つからへん、もしくはテキストチャンネルちゃうんちゃう？`);
            return;
        }
        await channel.send(text);
    } catch (err) {
        console.error(`送信失敗や、。: ${err}`);
    }
}

// 通知スケジュール（1分ごと）
setInterval(async () => {
    const now = dayjs();
    const hour = now.hour();
    const minute = now.minute();
    if (hour < 8 || hour > 22) return;

    for (const { date, name, channelId } of deadlines) {
        const deadlineDate = dayjs(date);

        // 締切3日前の同時刻通知
        if (deadlineDate.diff(now, 'minute') === 3 * 24 * 60) {
            await sendReminder(`【3日前通知】${name} の締め切りが近いで！忘れてへんか？`, channelId);
        }

        // 締切当日の8時に通知（時間は無視して日付だけを見る）
        if (
            deadlineDate.format('YYYY-MM-DD') === now.format('YYYY-MM-DD') &&
            hour === 8 && minute === 0
        ) {
            await sendReminder(`【本日締切】${name} の提出期限は今日やで！もう出したか？はよやりや！！`, channelId);
        }
    }

    // 過去の締切を削除
    const before = deadlines.length;
    deadlines = deadlines.filter(({ date }) => dayjs(date).isAfter(now));
    if (deadlines.length !== before) {
        fs.writeFileSync('deadlines.json', JSON.stringify(deadlines, null, 2));
    }
}, 60 * 1000); // 1分ごと

client.login(process.env.DISCORD_TOKEN);
