import { model, Schema } from "mongoose";

const birthdaySchema = new Schema(
  {
    // Discord IDs are strings because they do not fit in a JavaScript number.
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    // Makes documents easier to read; refreshed each time the birthday is set, since it can change.
    username: { type: String, required: true },
    // With a year, the full date at midnight UTC; without one, only the day and month.
    birthDate: { type: Date },
    day: { type: Number, min: 1, max: 31 },
    month: { type: Number, min: 1, max: 12 },
    setBy: { type: String, required: true },
  },
  { timestamps: true },
);

// One birthday per member in each server.
birthdaySchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const BirthdayModel = model("Birthday", birthdaySchema);
