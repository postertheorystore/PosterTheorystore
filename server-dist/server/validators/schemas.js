import { z } from "zod";
export const signupSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email"),
    password: z.string().min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain an uppercase letter")
        .regex(/[0-9]/, "Password must contain a number")
        .regex(/[^A-Za-z0-9]/, "Password must contain a special character"),
});
export const verifyOtpSchema = z.object({
    email: z.string().email("Invalid email"),
    code: z.string().length(6, "OTP must be 6 digits"),
});
export const loginSchema = z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(1, "Password is required"),
});
export const updateProfileSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
});
export const addressSchema = z.object({
    label: z.string().min(1).default("Home"),
    line1: z.string().min(1, "Address line 1 is required"),
    line2: z.string().optional().default(""),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    pincode: z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit Indian pincode"),
    is_default: z.boolean().optional().default(false),
});
export const setPasswordSchema = z.object({
    password: z.string().min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain an uppercase letter")
        .regex(/[0-9]/, "Password must contain a number")
        .regex(/[^A-Za-z0-9]/, "Password must contain a special character"),
});
export const createProductSchema = z.object({
    title: z.string().min(1, "Title is required"),
    collection: z.string().min(1, "Collection is required"),
    price: z.coerce.number().positive("Price must be positive"),
    layout: z.enum(['Single', 'Duo', 'Trio', 'Quad']).default('Single'),
});
export const createOrderSchema = z.object({
    total: z.number().optional(),
    items: z.any(),
    address_id: z.number().positive("Select a delivery address"),
});
export const createDesignSchema = z.object({
    text: z.string().min(1),
    font_size: z.number().positive(),
    size: z.string().min(1),
    position: z.any(),
});
