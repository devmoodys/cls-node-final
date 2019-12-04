import connection from "systems/db";
import moment from "moment";
import { isBlank } from "helpers/presence";
import ApiClient from "services/companies/apiClient";
const apiClient = new ApiClient();

const DEFAULT_COMPANY_PARTNER_PERMISSIONS = [
  "cls",
  "cmbs",
  "cmm",
  "compstak",
  "val",
  "reis",
  "infabode",
  "commercialex",
  "enricheddata",
  "retailmarketpoint",
  "databuffet",
  "fourtwentyseven"
];

export async function findCompanyByName(companyName) {
  const company = await apiClient.getCompany("company_name", companyName);
  return company;
}

export async function createCompany(
  companyName,
  maxActiveUsers,
  accountActiveLength = "2 weeks"
) {
  const endDate = moment().add(...accountActiveLength.split(" "));
  const noticeDate = moment(endDate).subtract(1, "week");
  await apiClient.createCompany({
    company_name: companyName,
    max_active_users: maxActiveUsers,
    end_date: endDate,
    notice_date: noticeDate
  });
  const company = await findCompanyByName(companyName);
  return company;
}

export async function getCompany(companyId) {
  if (isBlank(companyId)) {
    return null;
  }
  const company = await apiClient.getCompany("id", companyId);
  return company;
}

export async function getCompanies() {
  const companies = await apiClient.getCompanies("company_name", "all", 1);
  return companies;
}

export async function updateEndDate(companyId, endDate) {
  const noticeDate = moment(endDate).subtract(1, "week");
  await apiClient.updateCompany("id", companyId, {
    end_date: moment(endDate),
    notice_date: noticeDate
  });
}

export async function updateMaxActiveUsers(companyId, maxActiveUsers) {
  await apiClient.updateCompany("id", companyId, {
    max_active_users: maxActiveUsers
  });
}

export async function getCompanyPartnerPermissions(companyId) {
  const permissions = await connection("company_partner_permissions").where(
    "company_id",
    companyId
  );
  if (permissions.length === 0) {
    return DEFAULT_COMPANY_PARTNER_PERMISSIONS;
  }
  return permissions.map(permission => permission.partner);
}
