import { createAsyncThunk } from '@reduxjs/toolkit';
import ApiRequestManager from '../../_api_request_manager/api_request_manager';
import { User, ApiResponse } from '@tesseract/types';

export const fetchUser = createAsyncThunk(
  'user/fetchUser',
  async (userId: string, { rejectWithValue }) => {
    try {
      const api = ApiRequestManager.getInstance();
      const response = await api.get(`/users/${userId}`);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch user');
    }
  },
);

export const updateUser = createAsyncThunk(
  'user/updateUser',
  async (userData: User, { rejectWithValue }) => {
    try {
      const api = ApiRequestManager.getInstance();
      const response = await api.put<ApiResponse<User>>(`/users/${userData.id}`, userData);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update user');
    }
  },
);
