import { model, Schema } from "mongoose";
import { MAX_MESSAGE_LENGTH } from "../../../birthdays/birthday-content.js";

const birthdayContentSchema = new Schema(
  {
    // Discord IDs are strings because they do not fit in a JavaScript number.
    guildId: { type: String, required: true },
    type: { type: String, required: true, enum: ["message", "video"] },
    text: { type: String, maxlength: MAX_MESSAGE_LENGTH },
    videoId: { type: String },
    videoUrl: { type: String },
    addedBy: { type: String, required: true },
  },
  { timestamps: true },
);

birthdayContentSchema.index({ guildId: 1, createdAt: 1 });
// A video appears once per server; messages have no videoId and are not affected.
birthdayContentSchema.index({ guildId: 1, videoId: 1 }, { unique: true, partialFilterExpression: { videoId: { $type: "string" } } });

export const BirthdayContentModel = model("BirthdayContent", birthdayContentSchema);
