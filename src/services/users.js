import { compare, hash } from "bcryptjs";
import { contains } from "ramda";
import moment from "moment";
import connection from "systems/db";
import { getCompany } from "./companies";
import { statusActive, companyTermActive } from "helpers/auth";
import asArray from "helpers/asArray";

function toUser(row) {
  const {
    id,
    email,
    terms_accepted_at: termsAcceptedAt,
    role,
    company_id,
    status,
    notice_email_sent,
    login_types
  } = row;
  return {
    id,
    email,
    termsAcceptedAt,
    role,
    company_id,
    status,
    notice_email_sent,
    login_types
  };
}

export async function find(id) {
  return connection
    .select([
      "id",
      "email",
      "terms_accepted_at",
      "role",
      "company_id",
      "status",
      "notice_email_sent",
      "login_types"
    ])
    .from("users")
    .where("id", id)
    .limit(1)
    .map(toUser)
    .then(users => {
      if (users.length > 0) {
        return users[0];
      } else {
        return false;
      }
    });
}

export async function authenticate(email, password) {
  if (!password) {
    return false;
  }

  const userRows = await connection
    .select([
      "id",
      "email",
      "encrypted_password",
      "terms_accepted_at",
      "role",
      "status",
      "company_id",
      "notice_email_sent",
      "login_types"
    ])
    .from("users")
    .where("email", email.toLowerCase())
    .limit(1);

  if (userRows.length <= 0) {
    throw new Error("Username cannot be found");
  }

  const userRow = userRows[0];
  const { encrypted_password: encryptedPassword, status, company_id } = userRow;
  const company = await getCompany(company_id);
  if (!statusActive(status)) {
    throw new Error("Your accout has been deactivated");
  }

  if (!companyTermActive(company)) {
    throw new Error("Your company subscription has expired");
  }

  if (!encryptedPassword) {
    throw new Error("Invalid password");
  }
  const result = await compare(password, encryptedPassword);

  if (!result) {
    throw new Error("Invalid password");
  }

  return toUser(userRow);
}

export async function create(
  email,
  password,
  role,
  company_id = null,
  created_by_id = null
) {
  const encryptedPasswordPromise = password
    ? hash(password, 10)
    : Promise.resolve(null);

  const roles = ["user", "admin", "superadmin"];
  const acceptableRole = contains(role, roles) ? role : "user";

  return encryptedPasswordPromise.then(encrypted_password =>
    connection
      .insert({
        email: email.toLowerCase(),
        encrypted_password,
        company_id,
        created_by_id,
        role: acceptableRole
      })
      .into("users")
      .returning(["id", "email", "role", "status"])
      .map(toUser)
      .then(rows => rows[0])
  );
}

export async function findUserByEmail(email) {
  const user = await connection("users")
    .where({
      email: email.toLowerCase()
    })
    .first();
  return user;
}

export async function acceptTermsOfService(userId) {
  await connection("users")
    .where({
      id: userId
    })
    .update({
      terms_accepted_at: connection.fn.now()
    });
}

export async function allUsersOfCompany(companyId) {
  const userRows = await connection("users")
    .select([
      "id",
      "email",
      "role",
      "status",
      "notice_email_sent",
      "login_types"
    ])
    .where("company_id", companyId)
    .orderBy("email", "asc");

  return userRows;
}

export async function allActiveUsersOfCompany(companyId) {
  const userRows = await connection
    .select([
      "id",
      "email",
      "role",
      "status",
      "notice_email_sent",
      "login_types"
    ])
    .from("users")
    .where({ company_id: companyId, status: "active" });

  return userRows;
}

export async function allUsers() {
  const userRows = await connection("users")
    .leftOuterJoin("companies", "users.company_id", "companies.id")
    .select([
      "users.id",
      "users.email",
      "users.role",
      "users.company_id",
      "users.status",
      "users.notice_email_sent",
      "users.login_types",
      "companies.company_name"
    ])
    .orderBy("users.email", "asc");

  return userRows;
}

export async function remove(userId) {
  await connection("users")
    .where("id", userId)
    .del();
}

export async function deactivate(userId) {
  await connection("users")
    .where("id", userId)
    .update({ status: "inactive" });
}

export async function activate(userId) {
  await connection("users")
    .where("id", userId)
    .update({ status: "active" });
}

export async function updateNoticeEmailSent(userId) {
  await connection("users")
    .where("id", userId)
    .update({ notice_email_sent: true });
}

export async function updateUserLoginTypes(user, loginType) {
  const loginTypes = getUserLoginTypes(user);
  if (!loginTypes.includes(loginType)) {
    loginTypes.push(loginType);
    await connection("users")
      .where("id", user.id)
      .update({ login_types: JSON.stringify(loginTypes) });
    return { ...user, login_types: loginTypes };
  }
  return user;
}

export function getUserLoginTypes(user) {
  if (!user) {
    return [];
  }
  const loginTypes = user.login_types
    ? asArray(JSON.parse(user.login_types))
    : [];
  return loginTypes;
}

export async function setTemporaryPassword(userId, tempPassword) {
  const hashedTempPassword = await hash(tempPassword, 10);
  await connection("users")
    .where("id", userId)
    .update({
      temp_password: hashedTempPassword,
      temp_password_expire_time: moment().add(10, "minutes")
    });
}

export async function getInitialCustomWeights(userId) {
  const matchingEntries = await connection("custom_weights").where({
    user_id: userId
  });
  return matchingEntries;
}

export async function setUsersCustomWeights(
  user_id,
  property_type,
  safety,
  trnsprt,
  vitalty,
  economc,
  sptl_dm,
  amenity
) {
  let matchingEntry = await connection("custom_weights")
    .select(["user_id", "property_type"])
    .where({
      user_id: user_id,
      property_type: property_type
    })
    .first();

  if (matchingEntry) {
    const newRecord = await connection("custom_weights").insert([
      {
        user_id: user_id,
        property_type: property_type,
        safety: safety,
        trnsprt: trnsprt,
        vitalty: vitalty,
        economc: economc,
        sptl_dm: sptl_dm,
        amenity: amenity
      }
    ]);
    return newRecord;
  } else {
    const updatedEntry = await connection("custom_weights")
      .where({
        user_id: user_id,
        property_type: property_type
      })
      .update({
        safety: safety,
        trnsprt: trnsprt,
        vitalty: vitalty,
        economc: economc,
        sptl_dm: sptl_dm,
        amenity: amenity
      })
      .returning("*");
    return updatedEntry;
  }
}

export async function checkTemporaryPassword(userId, tempPassword) {
  const {
    temp_password: hashedTempPassword,
    temp_password_expire_time: expireTime
  } = await connection("users")
    .select(["temp_password", "temp_password_expire_time"])
    .where("id", userId)
    .first();

  if (!hashedTempPassword || !expireTime) {
    return false;
  }
  const correctTempPassword = await compare(tempPassword, hashedTempPassword);
  return correctTempPassword && moment() < moment(expireTime);
}

export async function changePassword(userId, newPassword) {
  const newHashedPassword = await hash(newPassword, 10);
  await connection("users")
    .where("id", userId)
    .update({ encrypted_password: newHashedPassword });
}