import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Badge,
  Button,
  Modal,
  FormLayout,
  TextField,
  Select,
  Checkbox,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  EmptyState,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

interface ReasonRecord {
  id: string;
  name: string;
  applicableFor: string;
  photoRequired: boolean;
  noteRequired: boolean;
  sortOrder: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const reasons = await prisma.returnReason.findMany({
    where: { shop },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      applicableFor: true,
      photoRequired: true,
      noteRequired: true,
      sortOrder: true,
    },
  });

  return json({ reasons });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add") {
    const name = (formData.get("name") as string) || "";
    const applicableFor = (formData.get("applicableFor") as string) || "both";
    const photoRequired = formData.get("photoRequired") === "true";
    const noteRequired = formData.get("noteRequired") === "true";

    if (!name.trim()) {
      return json({ success: false, message: "Name is required." });
    }

    const maxSort = await prisma.returnReason.aggregate({
      where: { shop },
      _max: { sortOrder: true },
    });

    await prisma.returnReason.create({
      data: {
        shop,
        name,
        applicableFor,
        photoRequired,
        noteRequired,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });

    return json({ success: true, message: "Reason added." });
  }

  if (intent === "edit") {
    const id = formData.get("id") as string;
    const name = (formData.get("name") as string) || "";
    const applicableFor = (formData.get("applicableFor") as string) || "both";
    const photoRequired = formData.get("photoRequired") === "true";
    const noteRequired = formData.get("noteRequired") === "true";

    if (!name.trim()) {
      return json({ success: false, message: "Name is required." });
    }

    await prisma.returnReason.update({
      where: { id },
      data: { name, applicableFor, photoRequired, noteRequired },
    });

    return json({ success: true, message: "Reason updated." });
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await prisma.returnReason.delete({ where: { id } });
    return json({ success: true, message: "Reason deleted." });
  }

  return json({ success: false, message: "Unknown intent." });
};

export default function SettingsReasons() {
  const { reasons } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success: boolean; message: string }>();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<ReasonRecord | null>(null);
  const [formName, setFormName] = useState("");
  const [formApplicableFor, setFormApplicableFor] = useState("both");
  const [formPhotoRequired, setFormPhotoRequired] = useState(false);
  const [formNoteRequired, setFormNoteRequired] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "critical"; message: string } | null>(null);

  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.success) {
        setFeedback({ type: "success", message: fetcher.data.message });
        setModalOpen(false);
        setDeleteConfirmId(null);
        resetForm();
      } else {
        setFeedback({ type: "critical", message: fetcher.data.message });
      }
    }
  }, [fetcher.data]);

  const resetForm = () => {
    setEditingReason(null);
    setFormName("");
    setFormApplicableFor("both");
    setFormPhotoRequired(false);
    setFormNoteRequired(false);
  };

  const openAdd = useCallback(() => {
    resetForm();
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((reason: ReasonRecord) => {
    setEditingReason(reason);
    setFormName(reason.name);
    setFormApplicableFor(reason.applicableFor);
    setFormPhotoRequired(reason.photoRequired);
    setFormNoteRequired(reason.noteRequired);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    resetForm();
  }, []);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", editingReason ? "edit" : "add");
    if (editingReason) formData.set("id", editingReason.id);
    formData.set("name", formName);
    formData.set("applicableFor", formApplicableFor);
    formData.set("photoRequired", String(formPhotoRequired));
    formData.set("noteRequired", String(formNoteRequired));
    fetcher.submit(formData, { method: "post" });
  }, [editingReason, formName, formApplicableFor, formPhotoRequired, formNoteRequired, fetcher]);

  const handleDelete = useCallback(
    (id: string) => {
      const formData = new FormData();
      formData.set("intent", "delete");
      formData.set("id", id);
      fetcher.submit(formData, { method: "post" });
    },
    [fetcher],
  );

  const isSaving = fetcher.state !== "idle";

  const resourceName = { singular: "reason", plural: "reasons" };

  const rowMarkup = (reasons as ReasonRecord[]).map((reason, index) => (
    <IndexTable.Row id={reason.id} key={reason.id} position={index}>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="bold">
          {reason.name}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge>{reason.applicableFor}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {reason.photoRequired ? (
          <Badge tone="info">Required</Badge>
        ) : (
          <Badge>Optional</Badge>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {reason.noteRequired ? (
          <Badge tone="info">Required</Badge>
        ) : (
          <Badge>Optional</Badge>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>{reason.sortOrder}</IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button size="slim" onClick={() => openEdit(reason)}>
            Edit
          </Button>
          {deleteConfirmId === reason.id ? (
            <InlineStack gap="100">
              <Button size="slim" tone="critical" onClick={() => handleDelete(reason.id)}>
                Confirm
              </Button>
              <Button size="slim" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </Button>
            </InlineStack>
          ) : (
            <Button size="slim" tone="critical" onClick={() => setDeleteConfirmId(reason.id)}>
              Delete
            </Button>
          )}
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      backAction={{ content: "Settings", url: "/app/settings" }}
      title="Return Reasons"
      primaryAction={
        <Button variant="primary" onClick={openAdd}>
          Add reason
        </Button>
      }
    >
      <BlockStack gap="400">
        {feedback && (
          <Banner tone={feedback.type} onDismiss={() => setFeedback(null)}>
            <p>{feedback.message}</p>
          </Banner>
        )}

        {(reasons as ReasonRecord[]).length === 0 ? (
          <Card>
            <EmptyState
              heading="No return reasons configured"
              image=""
            >
              <p>Add return reasons so customers can select why they are returning an item.</p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={(reasons as ReasonRecord[]).length}
              headings={[
                { title: "Name" },
                { title: "Applicable for" },
                { title: "Photo" },
                { title: "Note" },
                { title: "Sort order" },
                { title: "Actions" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        )}
      </BlockStack>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingReason ? "Edit Reason" : "Add Reason"}
        primaryAction={{
          content: "Save",
          onAction: handleSave,
          loading: isSaving,
          disabled: isSaving,
        }}
        secondaryActions={[{ content: "Cancel", onAction: closeModal }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Name"
              value={formName}
              onChange={setFormName}
              autoComplete="off"
              requiredIndicator
            />
            <Select
              label="Applicable for"
              options={[
                { label: "Return", value: "return" },
                { label: "Exchange", value: "exchange" },
                { label: "Both", value: "both" },
              ]}
              value={formApplicableFor}
              onChange={setFormApplicableFor}
            />
            <Checkbox
              label="Photo required"
              checked={formPhotoRequired}
              onChange={setFormPhotoRequired}
            />
            <Checkbox
              label="Note required"
              checked={formNoteRequired}
              onChange={setFormNoteRequired}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
