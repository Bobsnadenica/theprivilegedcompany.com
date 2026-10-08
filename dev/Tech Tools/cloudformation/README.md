# CloudFormation review lab

This is an intentionally incomplete architecture example for local code review.
It is not production-ready and must not be deployed as supplied. No credentials
are needed to read it. The deployment and cleanup launchers now exit without
calling AWS. This archive does not create or delete resources.

## Review findings

- root.yaml uses local nested-template paths without a packaging/upload step.
- network.yaml defines only one public and one private subnet, without the
  route tables required by the advertised topology. It does not create NAT.
- alb.yaml has no listener and only receives one Availability Zone subnet.
- ecs.yaml has no execution-role reference from security.yaml and no complete
  network/security-group/listener integration.
- There are no application health checks, working log-group integration or
  deployment verification. The description previously overstated these features.
- Resource names, account, region, scope and cleanup must be designed explicitly.
  Never delete a stack merely because a tutorial uses the same name.

## Exercise

Draw the dependency graph and explain each missing connection. Compare your
proposed fixes with the official guides below. Validate a corrected version in
an isolated account only after reviewing scope, access and current prices.
This pack is not an instruction to open an AWS account or incur any charges.

## Primary references

- https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-nested-stacks.html
- https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html
- https://aws.amazon.com/elasticloadbalancing/pricing/
- https://aws.amazon.com/fargate/pricing/

Reviewed: 2026-10-08. The browser Stack Builder is a separate visual simulation;
it never deploys AWS resources.
