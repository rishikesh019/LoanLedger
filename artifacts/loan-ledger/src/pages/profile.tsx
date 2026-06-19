import { useGetMe, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { User, Shield, Mail, Phone } from "lucide-react";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
});

type ProfileData = z.infer<typeof profileSchema>;

export default function Profile() {
  const { data: user, isLoading } = useGetMe();
  const updateMe = useUpdateMe();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", phone: "" },
  });

  useEffect(() => {
    if (user) {
      form.reset({ name: user.name, phone: user.phone ?? "" });
    }
  }, [user]);

  const onSubmit = (data: ProfileData) => {
    updateMe.mutate(
      { data: { name: data.name, phone: data.phone || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Profile updated", description: "Your information has been saved." });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: () => toast({ title: "Error", description: "Failed to update profile.", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6" data-testid="profile-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account information</p>
      </div>

      {/* Account Info */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Account Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="h-16 w-16 rounded-full bg-slate-900 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">{user?.name?.charAt(0).toUpperCase() ?? "U"}</span>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900" data-testid="text-user-name">{user?.name}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${user?.role === "admin" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                  <Shield className="h-3 w-3" />
                  {user?.role === "admin" ? "Administrator" : "User"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div className="flex items-center gap-2 text-slate-600">
              <Mail className="h-4 w-4 text-slate-400" />
              <span data-testid="text-user-email">{user?.email}</span>
            </div>
            {user?.phone && (
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="h-4 w-4 text-slate-400" />
                <span data-testid="text-user-phone">{user.phone}</span>
              </div>
            )}
          </div>

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-700">
            Password changes are managed through your authentication provider. Contact admin if you need a password reset.
          </div>
        </CardContent>
      </Card>

      {/* Edit Form */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Edit Information</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your name" {...field} data-testid="input-profile-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="+91 99999 99999" {...field} data-testid="input-profile-phone" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end">
                <Button type="submit" disabled={updateMe.isPending} className="bg-slate-900 hover:bg-slate-800" data-testid="button-save-profile">
                  {updateMe.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
