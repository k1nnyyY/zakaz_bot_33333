import express from "express";
import bodyParser from "body-parser";
import TelegramBot, { Message } from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import mongoose, { Schema, Document } from "mongoose";
import dotenv from "dotenv";
import dbConnectionString from "./dbConfig.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import https from "https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

interface ILesson extends Document {
  playlist: string;
  lessonNumber: number;
  videoUrl: string;
  description: string;
  imageUrl: string;
  hasSubLessons: boolean;
  subLessons?: Array<{
    lessonNumber: number;
    title: string;
    videoUrl: string;
  }>;
}

const LessonSchema: Schema = new Schema({
  playlist: { type: String, required: true },
  lessonNumber: { type: Number, required: true },
  videoUrl: { type: String, required: true },
  description: { type: String, required: true },
  imageUrl: { type: String, required: true },
  hasSubLessons: { type: Boolean, required: true },
  subLessons: [
    {
      lessonNumber: { type: Number, required: false },
      title: { type: String, required: false },
      videoUrl: { type: String, required: false },
    },
  ],
});

const Lesson = mongoose.model<ILesson>("Lesson", LessonSchema);

interface IMerch extends Document {
  name: string;
  price: number;
  description: string;
  images: string[];
}

const MerchSchema: Schema = new Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String, required: true },
  images: { type: [String], required: true },
});

const Merch = mongoose.model<IMerch>("Merch", MerchSchema);

interface IUser extends Document {
  chatId: number;
  authenticated: boolean;
  isAdmin: boolean;
  messageIds: number[];
}

const UserSchema: Schema = new Schema({
  chatId: { type: Number, required: true, unique: true },
  authenticated: { type: Boolean, required: true, default: false },
  isAdmin: { type: Boolean, required: true, default: false },
  messageIds: { type: [Number], default: [] },
});

const User = mongoose.model<IUser>("User", UserSchema);

const app = express();
const PORT = process.env.PORT || "3000";
const TOKEN = process.env.BOT_TOKEN || "YOUR_BOT_TOKEN";

console.log("Starting Telegram Bot...");
const bot = new TelegramBot(TOKEN, { polling: true });

app.use(bodyParser.json());

mongoose.set("strictQuery", true);

await mongoose
  .connect(dbConnectionString, {})
  .then(async () => {
    console.log("Connected to MongoDB");

    const imagesPath = path.join(__dirname, "images");
    if (!fs.existsSync(imagesPath)) {
      fs.mkdirSync(imagesPath);
    }

    function checkPassword(password: string): boolean {
      const filePath = path.join(__dirname, "../passwords.txt");
      const passwords = fs
        .readFileSync(filePath, "utf-8")
        .split("\n")
        .map((p) => p.trim());
      return passwords.includes(password.trim());
    }

    function checkAdminPassword(password: string): boolean {
      const filePath = path.join(__dirname, "../admin_passwords.txt");
      const passwords = fs
        .readFileSync(filePath, "utf-8")
        .split("\n")
        .map((p) => p.trim());
      return passwords.includes(password.trim());
    }

    bot.onText(/\/start/, async (msg: Message) => {
      const chatId = msg.chat.id;

      const user = await User.findOne({ chatId });
      if (user && user.authenticated) {
        const message = user.isAdmin
          ? "Вы вошли как администратор! Выберите раздел."
          : "Вы уже вошли в систему! Выберите раздел.";

        const keyboard = user.isAdmin
          ? [
              [{ text: "Управление уроками 📚" }],
              [{ text: "Управление мерчем 🛒" }],
              [{ text: "Управление паролями 🛠" }],
              [{ text: "Logout" }],
            ]
          : [
              [{ text: "Видео Курсы 🎉" }],
              [{ text: "Гайды 🥋" }],
              [{ text: "Отзывы 💬" }],
              [{ text: "Помощь 🚨" }],
              [{ text: "Как работать с ботом ❓" }],
              [{ text: "Мерч 🛒" }],
              [{ text: "Logout" }],
            ];

        const sentMessage = await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: keyboard,
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });

        user.messageIds.push(sentMessage.message_id);
        await user.save();
      } else {
        const sentMessage = await bot.sendMessage(
          chatId,
          "Добро пожаловать! Пожалуйста, нажмите кнопку Login для входа.",
          {
            reply_markup: {
              keyboard: [[{ text: "Login" }, { text: "Мерч 🛒" }]],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }
        );

        if (user) {
          user.messageIds.push(sentMessage.message_id);
          await user.save();
        }
      }
    });

    bot.on("message", async (msg: Message) => {
      const chatId = msg.chat.id;
      const text: string | undefined = msg.text;

      const user = await User.findOne({ chatId });

      if (text === "Мерч 🛒") {
        const merches = await Merch.find({});

        for (const merch of merches) {
          const mediaGroup = merch.images.map((imagePath, index) => ({
            type: "photo" as const,
            media: imagePath,
            caption:
              index === 0
                ? `${merch.name}\nЦена: ${merch.price}\nОписание: ${merch.description}`
                : undefined,
          }));

          await bot.sendMediaGroup(chatId, mediaGroup);
        }
        return;
      }

      if (user && user.authenticated) {
        if (text === "Logout") {
          await User.findOneAndUpdate(
            { chatId },
            { authenticated: false, isAdmin: false }
          );
          const sentMessage = await bot.sendMessage(
            chatId,
            "Вы успешно вышли из системы.",
            {
              reply_markup: {
                keyboard: [[{ text: "Login" }, { text: "Мерч 🛒" }]],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            }
          );

          user.messageIds.push(sentMessage.message_id);
          await user.save();
        } else if (user.isAdmin) {
          if (text === "Управление уроками 📚") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Выберите действие:",
              {
                reply_markup: {
                  keyboard: [
                    [{ text: "Добавить урок" }],
                    [{ text: "Удалить урок" }],
                    [{ text: "Просмотреть уроки" }],
                    [{ text: "Назад" }],
                  ],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              }
            );

            user.messageIds.push(sentMessage.message_id);
            await user.save();
          } else if (text === "Добавить урок") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Пожалуйста, отправьте картинку для превью урока."
            );
            user.messageIds.push(sentMessage.message_id);
            await user.save();

            bot.once("photo", async (msg: Message) => {
              const fileId = msg.photo?.[msg.photo.length - 1].file_id;
              if (!fileId) return;

              const file = await bot.getFile(fileId);
              const filePath = file.file_path;
              if (!filePath) return;
              const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
              const localPath = path.join(imagesPath, path.basename(filePath));
              const fileStream = fs.createWriteStream(localPath);

              https.get(fileUrl, (response: any) => {
                response.pipe(fileStream);
                fileStream.on("finish", async () => {
                  fileStream.close();

                  const sentMessage = await bot.sendMessage(
                    chatId,
                    "Теперь введите данные урока в формате:\n1) Плейлист\n2) Номер урока\n3) URL видео\n4) Описание\n5) Есть подуроки (да/нет)",
                    {
                      reply_markup: {
                        force_reply: true,
                      },
                    }
                  );

                  user.messageIds.push(sentMessage.message_id);
                  await user.save();

                  bot.onReplyToMessage(
                    chatId,
                    sentMessage.message_id,
                    async (reply) => {
                      const lessonData = reply.text
                        ?.split("\n")
                        .map((item) => item.replace(/^\d+\)\s*/, "").trim());
                      if (lessonData && lessonData.length >= 5) {
                        const newLesson = new Lesson({
                          playlist: lessonData[0],
                          lessonNumber: Number(lessonData[1]),
                          videoUrl: lessonData[2],
                          description: lessonData[3],
                          imageUrl: localPath,
                          hasSubLessons: lessonData[4].toLowerCase() === "да",
                        });
                        try {
                          await newLesson.save();
                          await bot.sendMessage(chatId, "Урок добавлен.");
                        } catch (error) {
                          await bot.sendMessage(
                            chatId,
                            "Произошла ошибка при добавлении урока."
                          );
                        }
                      } else {
                        await bot.sendMessage(
                          chatId,
                          "Неверный формат данных. Попробуйте снова."
                        );
                      }
                    }
                  );
                });
              });
            });
          } else if (text === "Удалить урок") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Введите номер урока для удаления:",
              {
                reply_markup: {
                  force_reply: true,
                },
              }
            );

            user.messageIds.push(sentMessage.message_id);
            await user.save();

            bot.onReplyToMessage(
              chatId,
              sentMessage.message_id,
              async (reply) => {
                const lessonNumber = reply.text?.trim();
                if (lessonNumber) {
                  await Lesson.deleteOne({
                    lessonNumber: Number(lessonNumber),
                  });
                  await bot.sendMessage(chatId, "Урок удален.");
                } else {
                  await bot.sendMessage(
                    chatId,
                    "Неверный номер урока. Попробуйте снова."
                  );
                }
              }
            );
          } else if (text === "Просмотреть уроки") {
            const lessons = await Lesson.find({}).sort({ lessonNumber: 1 });

            for (const lesson of lessons) {
              const inlineKeyboard =
                lesson.subLessons?.map((subLesson) => [
                  {
                    text: subLesson.title,
                    callback_data: JSON.stringify({
                      lessonNumber: lesson.lessonNumber,
                      subLessonNumber: subLesson.lessonNumber,
                    }),
                  },
                ]) || [];

              if (lesson.imageUrl) {
                const sentMessage = await bot.sendPhoto(
                  chatId,
                  lesson.imageUrl,
                  {
                    caption: `Урок ${lesson.lessonNumber}: ${lesson.description}\n[Смотреть видео](${lesson.videoUrl})`,
                    parse_mode: "Markdown",
                    reply_markup: {
                      inline_keyboard: inlineKeyboard,
                    },
                  }
                );
                user.messageIds.push(sentMessage.message_id);
              } else {
                const sentMessage = await bot.sendMessage(
                  chatId,
                  `Урок ${lesson.lessonNumber}: ${lesson.description}\n[Смотреть видео](${lesson.videoUrl})`,
                  {
                    parse_mode: "Markdown",
                    reply_markup: {
                      inline_keyboard: inlineKeyboard,
                    },
                  }
                );
                user.messageIds.push(sentMessage.message_id);
              }
            }
            await user.save();
          } else if (text === "Управление мерчем 🛒") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Выберите действие:",
              {
                reply_markup: {
                  keyboard: [
                    [{ text: "Добавить мерч" }],
                    [{ text: "Удалить мерч" }],
                    [{ text: "Просмотреть мерч" }],
                    [{ text: "Назад" }],
                  ],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              }
            );

            user.messageIds.push(sentMessage.message_id);
            await user.save();
          } else if (text === "Добавить мерч") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Пожалуйста, отправьте картинки для мерча (до 3 картинок)."
            );
            user.messageIds.push(sentMessage.message_id);
            await user.save();

            const imagePaths: string[] = [];

            bot.once("photo", async (msg: Message) => {
              const fileIds = msg.photo?.map((photo) => photo.file_id) || [];
              if (fileIds.length === 0) return;

              for (const fileId of fileIds) {
                const file = await bot.getFile(fileId);
                const filePath = file.file_path;
                if (!filePath) continue;
                const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
                const localPath = path.join(
                  imagesPath,
                  path.basename(filePath)
                );
                const fileStream = fs.createWriteStream(localPath);

                https.get(fileUrl, (response: any) => {
                  response.pipe(fileStream);
                  fileStream.on("finish", () => {
                    fileStream.close();
                    imagePaths.push(localPath);
                  });
                });
              }

              const sentMessage = await bot.sendMessage(
                chatId,
                "Теперь введите данные мерча в формате:\n1) Название\n2) Цена\n3) Описание",
                {
                  reply_markup: {
                    force_reply: true,
                  },
                }
              );

              user.messageIds.push(sentMessage.message_id);
              await user.save();

              bot.onReplyToMessage(
                chatId,
                sentMessage.message_id,
                async (reply) => {
                  const merchData = reply.text
                    ?.split("\n")
                    .map((item) => item.replace(/^\d+\)\s*/, "").trim());
                  if (merchData && merchData.length >= 3) {
                    const newMerch = new Merch({
                      name: merchData[0],
                      price: Number(merchData[1]),
                      description: merchData[2],
                      images: imagePaths,
                    });
                    try {
                      await newMerch.save();
                      await bot.sendMessage(chatId, "Мерч добавлен.");
                    } catch (error) {
                      await bot.sendMessage(
                        chatId,
                        "Произошла ошибка при добавлении мерча."
                      );
                    }
                  } else {
                    await bot.sendMessage(
                      chatId,
                      "Неверный формат данных. Попробуйте снова."
                    );
                  }
                }
              );
            });
          } else if (text === "Удалить мерч") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Введите название мерча для удаления:",
              {
                reply_markup: {
                  force_reply: true,
                },
              }
            );

            user.messageIds.push(sentMessage.message_id);
            await user.save();

            bot.onReplyToMessage(
              chatId,
              sentMessage.message_id,
              async (reply) => {
                const merchName = reply.text?.trim();
                if (merchName) {
                  await Merch.deleteOne({ name: merchName });
                  await bot.sendMessage(chatId, "Мерч удален.");
                } else {
                  await bot.sendMessage(
                    chatId,
                    "Неверное название мерча. Попробуйте снова."
                  );
                }
              }
            );
          } else if (text === "Просмотреть мерч") {
            const merches = await Merch.find({});

            for (const merch of merches) {
              const mediaGroup = merch.images.map((imagePath, index) => ({
                type: "photo" as const,
                media: imagePath,
                caption:
                  index === 0
                    ? `${merch.name}\nЦена: ${merch.price}\nОписание: ${merch.description}`
                    : undefined,
              }));

              await bot.sendMediaGroup(chatId, mediaGroup);
            }
            await user.save();
          } else if (text === "Управление паролями 🛠") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Выберите действие:",
              {
                reply_markup: {
                  keyboard: [
                    [{ text: "Показать все пароли" }],
                    [{ text: "Добавить пароль" }],
                    [{ text: "Удалить пароль" }],
                    [{ text: "Назад" }],
                  ],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              }
            );

            user.messageIds.push(sentMessage.message_id);
            await user.save();
          } else if (text === "Показать все пароли") {
            const filePath = path.join(__dirname, "../passwords.txt");
            const passwords = fs.readFileSync(filePath, "utf-8");
            await bot.sendMessage(
              chatId,
              `Пароли пользователей:\n${passwords}`
            );
          } else if (text === "Добавить пароль") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Введите новый пароль:"
            );
            user.messageIds.push(sentMessage.message_id);
            await user.save();

            bot.once("message", async (msg: Message) => {
              const newPass = msg.text?.trim();
              if (newPass) {
                fs.appendFileSync(
                  path.join(__dirname, "../passwords.txt"),
                  `\n${newPass}`
                );
                await bot.sendMessage(chatId, "Пароль добавлен.");
              }
            });
          } else if (text === "Удалить пароль") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Введите пароль для удаления:"
            );
            user.messageIds.push(sentMessage.message_id);
            await user.save();

            bot.once("message", async (msg: Message) => {
              const delPass = msg.text?.trim();
              if (delPass) {
                const filePath = path.join(__dirname, "../passwords.txt");
                const passwords = fs
                  .readFileSync(filePath, "utf-8")
                  .split("\n")
                  .map((p) => p.trim());
                const updatedPasswords = passwords.filter((p) => p !== delPass);
                fs.writeFileSync(filePath, updatedPasswords.join("\n"));
                await bot.sendMessage(chatId, "Пароль удален.");
              }
            });
          } else if (text === "Назад") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Выберите раздел.",
              {
                reply_markup: {
                  keyboard: [
                    [{ text: "Управление уроками 📚" }],
                    [{ text: "Управление мерчем 🛒" }],
                    [{ text: "Управление паролями 🛠" }],
                    [{ text: "Logout" }],
                  ],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              }
            );

            user.messageIds.push(sentMessage.message_id);
            await user.save();
          }
        }
      } else if (text === "Login") {
        const sentMessage = await bot.sendMessage(
          chatId,
          "Пожалуйста, введите ваш пароль."
        );
        if (user) {
          user.messageIds.push(sentMessage.message_id);
          await user.save();
        }
      } else if (text && checkPassword(text)) {
        await User.findOneAndUpdate(
          { chatId },
          { authenticated: true, isAdmin: false },
          { upsert: true, new: true }
        );

        const sentMessage = await bot.sendMessage(
          chatId,
          "Пароль верный! Выберите раздел.",
          {
            reply_markup: {
              keyboard: [
                [{ text: "Видео Курсы 🎉" }],
                [{ text: "Гайды 🥋" }],
                [{ text: "Отзывы 💬" }],
                [{ text: "Помощь 🚨" }],
                [{ text: "Как работать с ботом ❓" }],
                [{ text: "Мерч 🛒" }],
                [{ text: "Logout" }],
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }
        );

        if (user) {
          user.messageIds.push(sentMessage.message_id);
          await user.save();
        }
      } else if (text && checkAdminPassword(text)) {
        await User.findOneAndUpdate(
          { chatId },
          { authenticated: true, isAdmin: true },
          { upsert: true, new: true }
        );

        const sentMessage = await bot.sendMessage(
          chatId,
          "Вы вошли как администратор! Выберите раздел.",
          {
            reply_markup: {
              keyboard: [
                [{ text: "Управление уроками 📚" }],
                [{ text: "Управление мерчем 🛒" }],
                [{ text: "Управление паролями 🛠" }],
                [{ text: "Logout" }],
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }
        );

        if (user) {
          user.messageIds.push(sentMessage.message_id);
          await user.save();
        }
      } else if (text) {
        const sentMessage = await bot.sendMessage(
          chatId,
          "Пароль неверный, попробуйте снова."
        );
        if (user) {
          user.messageIds.push(sentMessage.message_id);
          await user.save();
        }
      }
    });

    bot.on("callback_query", (callbackQuery) => {
      const { message, data } = callbackQuery;
      if (!message || !data) {
        return;
      }

      try {
        const { lessonNumber, subLessonNumber } = JSON.parse(data);
        Lesson.findOne({ lessonNumber }).then((lesson) => {
          if (lesson && lesson.subLessons) {
            const subLesson = lesson.subLessons.find(
              (s) => s.lessonNumber === subLessonNumber
            );
            if (subLesson) {
              bot.sendMessage(
                message.chat.id,
                `Подурок ${subLesson.lessonNumber}: ${subLesson.title}\n[Смотреть видео](${subLesson.videoUrl})`,
                { parse_mode: "Markdown" }
              );
            }
          }
        });
      } catch (error) {
        console.error("Error parsing callback data: ", error);
      }
    });

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => console.log(error));
