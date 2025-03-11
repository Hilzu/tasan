import { Button } from "~/components/button";
import { Card } from "~/components/card";
import {
  InputField,
  RadioGroupField,
  SelectField,
  TextField,
} from "~/components/formField";
import { MainHeading, SubHeading } from "~/components/heading";
import { Link } from "~/components/link";

import type { Route } from "./+types/components";

export default function Components(_: Route.ComponentProps) {
  return (
    <div>
      <MainHeading>Million dollar budget design system</MainHeading>
      <p>These are the components available in the app.</p>

      <SubHeading className="mt-4">Links</SubHeading>
      <section className="space-x-4">
        <Link to="/components">Normal</Link>
        <Link to="/components" variant="plain">
          Plain
        </Link>
        <Link to="/components" variant="plain">
          <Button>Button inside plain link</Button>
        </Link>
      </section>

      <SubHeading className="mt-4">Buttons</SubHeading>
      <section className="space-x-4">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
      </section>

      <SubHeading className="mt-4">Input Field</SubHeading>
      <InputField label="Test" name="test" />

      <SubHeading className="mt-4">Input Field with description</SubHeading>
      <InputField
        label="Test 2"
        description="This is a description"
        name="test2"
      />

      <SubHeading className="mt-4">Input Field with errors</SubHeading>
      <InputField label="Test 3" errors={["This is an error"]} name="test3" />

      <SubHeading className="mt-4">
        Input Field with description and errors
      </SubHeading>
      <InputField
        label="Test 4"
        description="This is a description"
        errors={["This is an error"]}
        name="test4"
      />

      <SubHeading className="mt-4">Input Field with leading addon</SubHeading>
      <InputField label="Test 5" name="test5" leadingAddon="USD" />

      <SubHeading className="mt-4">Text Field</SubHeading>
      <TextField label="Text" name="text" />

      <SubHeading className="mt-4">Select Field</SubHeading>
      <SelectField label="Select" name="select">
        <option value="1">Option 1</option>
        <option value="2">Option 2</option>
        <option value="3">Option 3</option>
      </SelectField>

      <SubHeading className="mt-4">Radio group field</SubHeading>
      <RadioGroupField
        label="Radio group"
        items={[
          { value: "1", label: "Option 1", name: "radio" },
          { value: "2", label: "Option 2", name: "radio" },
          { value: "3", label: "Option 3", name: "radio" },
        ]}
      />

      <SubHeading className="mt-4">Radio group field inline</SubHeading>
      <RadioGroupField
        label="Radio group inline"
        inline
        items={[
          { value: "1", label: "Option 1", name: "radio2" },
          {
            value: "2",
            label: "Option 2",
            name: "radio2",
            defaultChecked: true,
          },
          { value: "3", label: "Option 3", name: "radio2" },
        ]}
      />

      <SubHeading className="mt-4">Card</SubHeading>
      <Card
        heading={<SubHeading>Card heading</SubHeading>}
        action={<Button>Click me</Button>}
      >
        <p>This is a card</p>
      </Card>
    </div>
  );
}
