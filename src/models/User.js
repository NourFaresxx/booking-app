const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['admin', 'staff', 'customer'],
      default: 'customer',
    },
    refreshTokenHash: { type: String, default: null },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.methods.toSafeObject = function () {
  const { _id, name, email, role, createdAt } = this;
  return { id: _id, name, email, role, createdAt };
};

module.exports = mongoose.model('User', userSchema);
