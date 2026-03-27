import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const templatePath = path.join(
  process.cwd(),
  "packages/scripts/cloudformation/per-user-stack.json",
);

const template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));

describe("per-user CloudFormation template", () => {
  test("disables direct container port exposure by default", () => {
    expect(template.Parameters.DirectContainerPortCidr.Default).toBe("");
    expect(template.Conditions.HasDirectContainerPortCidr).toEqual({
      "Fn::Not": [
        {
          "Fn::Equals": [
            { Ref: "DirectContainerPortCidr" },
            "",
          ],
        },
      ],
    });

    const ingressRules = template.Resources.UserSecurityGroup.Properties.SecurityGroupIngress;
    const directIngressRule = ingressRules.find(
      (rule: Record<string, unknown>) => "Fn::If" in rule,
    );

    expect(directIngressRule).toEqual({
      "Fn::If": [
        "HasDirectContainerPortCidr",
        {
          IpProtocol: "tcp",
          FromPort: { Ref: "ContainerPort" },
          ToPort: { Ref: "ContainerPort" },
          CidrIp: { Ref: "DirectContainerPortCidr" },
          Description: "Optional direct access to container port",
        },
        { Ref: "AWS::NoValue" },
      ],
    });
  });

  test("still allows ALB traffic to reach the container port", () => {
    const ingressRules = template.Resources.UserSecurityGroup.Properties.SecurityGroupIngress;

    expect(ingressRules).toContainEqual({
      IpProtocol: "tcp",
      FromPort: { Ref: "ContainerPort" },
      ToPort: { Ref: "ContainerPort" },
      SourceSecurityGroupId: { Ref: "SharedALBSecurityGroupId" },
      Description: "Allow traffic from ALB",
    });
  });
});
