// src/services/policyService.js
// Leave types and gazetted holidays; these calls throw an Error with a readable message on failure.
// Every call returns the whole policy: { leaveTypes, holidays } (changes also include
// `recalculated`, the number of booked requests whose days were recounted).
import api, { errorMessage } from './api';

const call = async (promise) => {
  try {
    return (await promise).data;
  } catch (err) {
    throw new Error(errorMessage(err));
  }
};

export const fetchPolicy = () => call(api.get('/policy'));

// leaveType: { name, entitlement, unit, attachmentRequiredOver, active }
export const createLeaveType = (leaveType) => call(api.post('/policy/leave-types', leaveType));
export const updateLeaveType = (id, changes) => call(api.patch(`/policy/leave-types/${id}`, changes));

export const addHoliday = (date, name) => call(api.post('/policy/holidays', { date, name }));
export const deleteHoliday = (id) => call(api.delete(`/policy/holidays/${id}`));
